/*
 * Copyright 2022 Fernando Boucquez
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ConfigAccount, CustomPreset } from 'symbol-bootstrap';
import { CurrencyDistribution } from 'symbol-bootstrap/lib/model/ConfigPreset';
import { NodeInformation, NodeMetadataType, RestProtocol } from './NodeInformation';

export interface CosignerAccountInput {
    number: number;
    publicKey: string;
    balance: number;
    testOnlyPrivateKey?: string; // only for e2e testsing
}

export interface CosignerAccount extends CosignerAccountInput {
    address: string;
}

export interface NodeTypeInput {
    nickName: string;
    nodeType: NodeMetadataType;
    total: number;
    balances: number[];
    restProtocol?: RestProtocol;
}

export interface CosignerPersonInput {
    number: number;
    cosignerAccounts: CosignerAccountInput[];
}

export interface CosignerPerson {
    number: number;
    cosignerAccounts: CosignerAccount[];
}

export interface BalanceConfigAccount extends ConfigAccount {
    balance: number;
}
export type TransactionInformation = {
    type: string;
    nodeNumber: number;
    typeNumber: number;
    payload: string;
};

export interface BasicNetworkFile {
    preset: string;
    cloneFromPreset?: string;
    networkType: number;
    isNewNetwork: boolean;
    nemesisSeedFolder?: string;
    faucetBalances?: number[];
    additionalCurrencyDistributions?: CurrencyDistribution[][];
    multisig?: {
        ownershipCount: number;
        cosigners: CosignerPerson[];
        minApprovalDelta: number;
        minRemovalDelta: number;
    };
    domain: string;
    suffix: string;
    friendlyNamePattern: string;
    customNetworkPreset?: CustomPreset;
}

export interface NetworkFile<N extends NodeInformation = NodeInformation> extends BasicNetworkFile {
    nodes: N[];
}

export interface NetworkInputFile<N extends NodeTypeInput = NodeTypeInput> extends BasicNetworkFile {
    nodeTypes: N[];
}
