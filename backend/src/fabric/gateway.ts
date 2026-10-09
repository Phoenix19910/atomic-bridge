import * as grpc from '@grpc/grpc-js';
import {
  connect,
  Contract,
  Gateway,
  Identity,
  Signer,
  signers,
  Network,
} from '@hyperledger/fabric-gateway';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { config, OrgConfig } from '../config';
import { mockLedger } from './mockLedger';
import { eventService } from '../services/events';

interface ActiveGateway {
  gateway: Gateway;
  network: Network;
  contract: Contract;
  client: grpc.Client;
}

export class FabricGatewayService {
  private gateways: Map<string, ActiveGateway> = new Map();
  private networkConnected: boolean = false;
  private lastCheckError: string | null = null;
  private connectionChecked: boolean = false;

  constructor() {
    // Proactively verify network connectivity on startup
    this.checkConnectivity();
  }

  public async checkConnectivity(): Promise<{
    connected: boolean;
    mockMode: boolean;
    channelName: string;
    chaincodeName: string;
    peers: Record<string, string>;
    lastError: string | null;
  }> {
    const peerStatuses: Record<string, string> = {
      'BankA-MSP': config.peers.banka.endpoint,
      'RBI-MSP': config.peers.rbi.endpoint,
      'BankC-MSP': config.peers.bankc.endpoint,
      'MAS-MSP': config.peers.mas.endpoint,
    };

    if (config.mockFabric) {
      this.networkConnected = false;
      this.connectionChecked = true;
      return {
        connected: false,
        mockMode: true,
        channelName: config.channelName,
        chaincodeName: config.chaincodeName,
        peers: peerStatuses,
        lastError: 'Mock mode forced via MOCK_FABRIC=true',
      };
    }

    try {
      // Attempt connection to BankA peer
      const orgConfig = config.getOrgConfig('BankA-MSP');
      if (!fs.existsSync(orgConfig.tlsCaPath) || !fs.existsSync(orgConfig.userCertPath)) {
        this.networkConnected = false;
        this.lastCheckError = `Crypto material not found at ${orgConfig.tlsCaPath}`;
        this.connectionChecked = true;
        return {
          connected: false,
          mockMode: true,
          channelName: config.channelName,
          chaincodeName: config.chaincodeName,
          peers: peerStatuses,
          lastError: this.lastCheckError,
        };
      }

      await this.getContract('BankA-MSP');
      this.networkConnected = true;
      this.lastCheckError = null;
    } catch (err: any) {
      this.networkConnected = false;
      this.lastCheckError = err.message || 'Fabric peer unreachable';
    }

    this.connectionChecked = true;
    return {
      connected: this.networkConnected,
      mockMode: !this.networkConnected,
      channelName: config.channelName,
      chaincodeName: config.chaincodeName,
      peers: peerStatuses,
      lastError: this.lastCheckError,
    };
  }

  public isLive(): boolean {
    return this.networkConnected && !config.mockFabric;
  }

  private loadIdentity(certPath: string, mspId: string): Identity {
    const credentials = fs.readFileSync(certPath);
    return { mspId, credentials };
  }

  private loadSigner(keyDir: string): Signer {
    const files = fs.readdirSync(keyDir);
    const keyFile = files.find(
      (f) => f.endsWith('_sk') || f.endsWith('.pem') || f.endsWith('.key')
    );
    if (!keyFile) {
      throw new Error(`No private key file found in ${keyDir}`);
    }
    const keyPem = fs.readFileSync(path.join(keyDir, keyFile));
    const privateKey = crypto.createPrivateKey(keyPem);
    return signers.newPrivateKeySigner(privateKey);
  }

  private createGrpcClient(org: OrgConfig): grpc.Client {
    const tlsRootCert = fs.readFileSync(org.tlsCaPath);
    const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
    return new grpc.Client(org.peerEndpoint, tlsCredentials, {
      'grpc.ssl_target_name_override': org.peerHostOverride,
    });
  }

  public async getContract(mspId: string): Promise<Contract> {
    if (this.gateways.has(mspId)) {
      return this.gateways.get(mspId)!.contract;
    }

    const org = config.getOrgConfig(mspId);
    const client = this.createGrpcClient(org);
    const identity = this.loadIdentity(org.userCertPath, org.mspId);
    const signer = this.loadSigner(org.userKeyDirectory);

    const gateway = connect({
      client,
      identity,
      signer,
      evaluateOptions: () => ({ deadline: Date.now() + 60000 }),
      endorseOptions: () => ({ deadline: Date.now() + 60000 }),
      submitOptions: () => ({ deadline: Date.now() + 10000 }),
      commitStatusOptions: () => ({ deadline: Date.now() + 60000 }),
    });

    const network = gateway.getNetwork(config.channelName);
    const contract = network.getContract(config.chaincodeName);

    this.gateways.set(mspId, { gateway, network, contract, client });

    // Listen to chaincode events if live
    this.startEventListener(network);

    return contract;
  }

  private async startEventListener(network: Network): Promise<void> {
    try {
      const events = await network.getChaincodeEvents(config.chaincodeName);
      (async () => {
        try {
          for await (const event of events) {
            const payloadStr = Buffer.from(event.payload).toString('utf8');
            try {
              const parsed = JSON.parse(payloadStr);
              eventService.broadcast(event.eventName, parsed);
            } catch {
              eventService.broadcast(event.eventName, { raw: payloadStr });
            }
          }
        } catch {
          // ignore event stream disconnect
        }
      })();
    } catch {
      // Event listening not supported in disconnected mode
    }
  }

  // =========================================================================
  // Unified Transaction Invocations (Real Fabric Gateway with Mock Fallback)
  // =========================================================================

  public async submit(
    callerMSP: string,
    functionName: string,
    args: string[],
    endorsingOrgs?: string[]
  ): Promise<any> {
    if (this.isLive()) {
      try {
        const contract = await this.getContract(callerMSP);
        const submitOptions: any = { arguments: args };
        if (endorsingOrgs && endorsingOrgs.length > 0) {
          submitOptions.endorsingOrganizations = endorsingOrgs;
        }
        const resultBytes = await contract.submit(functionName, submitOptions);
        const resultStr = Buffer.from(resultBytes).toString('utf8');
        return resultStr ? JSON.parse(resultStr) : { status: 'SUCCESS' };
      } catch (err: any) {
        console.warn(`[FabricGateway] Live invocation of ${functionName} failed: ${err.message}. Routing to mock ledger.`);
      }
    }

    // Fallback to in-memory ledger
    return this.fallbackSubmit(callerMSP, functionName, args);
  }

  public async evaluate(
    callerMSP: string,
    functionName: string,
    args: string[]
  ): Promise<any> {
    if (this.isLive()) {
      try {
        const contract = await this.getContract(callerMSP);
        const resultBytes = await contract.evaluate(functionName, { arguments: args });
        const resultStr = Buffer.from(resultBytes).toString('utf8');
        return resultStr ? JSON.parse(resultStr) : null;
      } catch (err: any) {
        console.warn(`[FabricGateway] Live evaluate of ${functionName} failed: ${err.message}. Routing to mock ledger.`);
      }
    }

    // Fallback to in-memory ledger
    return this.fallbackEvaluate(callerMSP, functionName, args);
  }

  private async fallbackSubmit(callerMSP: string, functionName: string, args: string[]): Promise<any> {
    switch (functionName) {
      case 'SetJurisdictionRule':
        return await mockLedger.setJurisdictionRule(
          callerMSP,
          args[0],
          Number(args[1]),
          Number(args[2]),
          Number(args[3]),
          Number(args[4]),
          Number(args[5])
        );
      case 'MintTokens':
        return await mockLedger.mintTokens(callerMSP, args[0], args[1], Number(args[2]));
      case 'BurnTokens':
        return await mockLedger.burnTokens(callerMSP, args[0], Number(args[1]));
      case 'InitiateTrade':
        return await mockLedger.initiateTrade(
          callerMSP,
          args[0],
          args[1],
          Number(args[2]),
          Number(args[3]),
          Number(args[4])
        );
      case 'LockTradeLeg':
        return await mockLedger.lockTradeLeg(callerMSP, args[0], args[1] as 'LEG1' | 'LEG2');
      case 'ExecutePvPSwap':
        return await mockLedger.executePvPSwap(args[0]);
      case 'CancelOrRefundTrade':
        return await mockLedger.cancelOrRefundTrade(callerMSP, args[0]);
      default:
        throw new Error(`Unsupported fallback submit function: ${functionName}`);
    }
  }

  private async fallbackEvaluate(callerMSP: string, functionName: string, args: string[]): Promise<any> {
    switch (functionName) {
      case 'GetJurisdictionRule':
        return await mockLedger.getJurisdictionRule(args[0]);
      case 'GetBalance':
        return await mockLedger.getBalance(args[0], args[1]);
      case 'GetTradeTerms':
        return await mockLedger.getTradeTerms(args[0]);
      case 'GetSettlement':
        return await mockLedger.getSettlement(args[0]);
      case 'GetEscrow':
        return await mockLedger.getEscrow(args[0], args[1]);
      case 'GetRefund':
        return await mockLedger.getRefund(args[0]);
      case 'GetComplianceRecord':
        return await mockLedger.getComplianceRecord(args[0]);
      case 'GetTradeStatus':
        return await mockLedger.getTradeStatus(args[0]);
      case 'GetAllTrades':
        return await mockLedger.getAllTrades();
      default:
        throw new Error(`Unsupported fallback evaluate function: ${functionName}`);
    }
  }

  public async closeAll(): Promise<void> {
    for (const [msp, gw] of this.gateways.entries()) {
      try {
        gw.gateway.close();
        gw.client.close();
      } catch {
        // ignore close errors
      }
    }
    this.gateways.clear();
  }
}

export const gatewayService = new FabricGatewayService();
