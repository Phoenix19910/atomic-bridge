import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export interface OrgConfig {
  mspId: string;
  peerEndpoint: string;
  peerHostOverride: string;
  tlsCaPath: string;
  userCertPath: string;
  userKeyDirectory: string;
}

const DEFAULT_CRYPTO_PATH = path.resolve(
  __dirname,
  '../../network/organizations'
);

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  host: process.env.HOST || '0.0.0.0',
  channelName: process.env.CHANNEL_NAME || 'corridor-channel',
  chaincodeName: process.env.CHAINCODE_NAME || 'atomicbridge',
  cryptoPath: process.env.CRYPTO_PATH || DEFAULT_CRYPTO_PATH,
  mockFabric: process.env.MOCK_FABRIC === 'true',
  watcherIntervalMs: parseInt(process.env.EXPIRY_WATCHER_INTERVAL_MS || '5000', 10),
  watcherMSP: process.env.EXPIRY_WATCHER_MSP || 'RBI-MSP',

  // Four active endorsing peer endpoints
  peers: {
    banka: {
      endpoint: process.env.PEER_BANKA_ENDPOINT || 'localhost:10051',
      hostOverride: 'peer0.banka.india',
      tlsCaRel: 'peerOrganizations/banka.india/peers/peer0.banka.india/tls/ca.crt',
    },
    rbi: {
      endpoint: process.env.PEER_RBI_ENDPOINT || 'localhost:10052',
      hostOverride: 'peer0.rbi.india',
      tlsCaRel: 'peerOrganizations/rbi.india/peers/peer0.rbi.india/tls/ca.crt',
    },
    bankc: {
      endpoint: process.env.PEER_BANKC_ENDPOINT || 'localhost:12051',
      hostOverride: 'peer0.bankc.singapore',
      tlsCaRel: 'peerOrganizations/bankc.singapore/peers/peer0.bankc.singapore/tls/ca.crt',
    },
    mas: {
      endpoint: process.env.PEER_MAS_ENDPOINT || 'localhost:12052',
      hostOverride: 'peer0.mas.singapore',
      tlsCaRel: 'peerOrganizations/mas.singapore/peers/peer0.mas.singapore/tls/ca.crt',
    },
  },

  getOrgConfig(mspId: string): OrgConfig {
    const base = this.cryptoPath;
    switch (mspId) {
      case 'BankA-MSP':
        return {
          mspId: 'BankA-MSP',
          peerEndpoint: this.peers.banka.endpoint,
          peerHostOverride: this.peers.banka.hostOverride,
          tlsCaPath: path.join(base, this.peers.banka.tlsCaRel),
          userCertPath: path.join(base, 'peerOrganizations/banka.india/users/User1@banka.india/msp/signcerts/User1@banka.india-cert.pem'),
          userKeyDirectory: path.join(base, 'peerOrganizations/banka.india/users/User1@banka.india/msp/keystore'),
        };
      case 'RBI-MSP':
        return {
          mspId: 'RBI-MSP',
          peerEndpoint: this.peers.rbi.endpoint,
          peerHostOverride: this.peers.rbi.hostOverride,
          tlsCaPath: path.join(base, this.peers.rbi.tlsCaRel),
          userCertPath: path.join(base, 'peerOrganizations/rbi.india/users/User1@rbi.india/msp/signcerts/User1@rbi.india-cert.pem'),
          userKeyDirectory: path.join(base, 'peerOrganizations/rbi.india/users/User1@rbi.india/msp/keystore'),
        };
      case 'BankC-MSP':
        return {
          mspId: 'BankC-MSP',
          peerEndpoint: this.peers.bankc.endpoint,
          peerHostOverride: this.peers.bankc.hostOverride,
          tlsCaPath: path.join(base, this.peers.bankc.tlsCaRel),
          userCertPath: path.join(base, 'peerOrganizations/bankc.singapore/users/User1@bankc.singapore/msp/signcerts/User1@bankc.singapore-cert.pem'),
          userKeyDirectory: path.join(base, 'peerOrganizations/bankc.singapore/users/User1@bankc.singapore/msp/keystore'),
        };
      case 'MAS-MSP':
        return {
          mspId: 'MAS-MSP',
          peerEndpoint: this.peers.mas.endpoint,
          peerHostOverride: this.peers.mas.hostOverride,
          tlsCaPath: path.join(base, this.peers.mas.tlsCaRel),
          userCertPath: path.join(base, 'peerOrganizations/mas.singapore/users/User1@mas.singapore/msp/signcerts/User1@mas.singapore-cert.pem'),
          userKeyDirectory: path.join(base, 'peerOrganizations/mas.singapore/users/User1@mas.singapore/msp/keystore'),
        };
      case 'BankB-MSP':
        return {
          mspId: 'BankB-MSP',
          peerEndpoint: this.peers.banka.endpoint,
          peerHostOverride: this.peers.banka.hostOverride,
          tlsCaPath: path.join(base, this.peers.banka.tlsCaRel),
          userCertPath: path.join(base, 'peerOrganizations/bankb.india/users/User1@bankb.india/msp/signcerts/User1@bankb.india-cert.pem'),
          userKeyDirectory: path.join(base, 'peerOrganizations/bankb.india/users/User1@bankb.india/msp/keystore'),
        };
      case 'BankD-MSP':
        return {
          mspId: 'BankD-MSP',
          peerEndpoint: this.peers.bankc.endpoint,
          peerHostOverride: this.peers.bankc.hostOverride,
          tlsCaPath: path.join(base, this.peers.bankc.tlsCaRel),
          userCertPath: path.join(base, 'peerOrganizations/bankd.singapore/users/User1@bankd.singapore/msp/signcerts/User1@bankd.singapore-cert.pem'),
          userKeyDirectory: path.join(base, 'peerOrganizations/bankd.singapore/users/User1@bankd.singapore/msp/keystore'),
        };
      case 'Auditor-MSP':
        return {
          mspId: 'Auditor-MSP',
          peerEndpoint: this.peers.banka.endpoint,
          peerHostOverride: this.peers.banka.hostOverride,
          tlsCaPath: path.join(base, this.peers.banka.tlsCaRel),
          userCertPath: path.join(base, 'peerOrganizations/auditor.consortium/users/User1@auditor.consortium/msp/signcerts/User1@auditor.consortium-cert.pem'),
          userKeyDirectory: path.join(base, 'peerOrganizations/auditor.consortium/users/User1@auditor.consortium/msp/keystore'),
        };
      default:
        throw new Error(`Unsupported or unknown MSP ID: ${mspId}`);
    }
  },
};
