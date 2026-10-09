/*
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Contract } from 'fabric-contract-api';
import { AtomicBridgeContract } from './atomicBridgeContract';

export { AtomicBridgeContract } from './atomicBridgeContract';
export const contracts: typeof Contract[] = [AtomicBridgeContract];
