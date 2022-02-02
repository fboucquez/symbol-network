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

import { Assembly, CustomPreset, NodeAccount as NodeAddresses } from 'symbol-bootstrap';

export enum NodeMetadataType {
    VotingDual = 'VotingDual',
    VotingPeer = 'VotingPeer',
    VotingApi = 'VotingApi',
    HarvestingDual = 'HarvestingDual',
    HarvestingPeer = 'HarvestingPeer',
    Services = 'Services',
    Peer = 'Peer',
    Api = 'Api',
    HarvestingDemo = 'HarvestingDemo',
    VotingNonHarvestingPeer = 'VotingNonHarvestingPeer',
}

export enum RestProtocol {
    HttpOnly = 'HttpOnly',
    HttpsOnly = 'HttpsOnly',
    HttpAndHttps = 'HttpAndHttps',
}

export class NodeMetadataUtils {
    public static getAssembly(metadata: NodeTypeMetadata): string {
        if (metadata.assembly) {
            return metadata.assembly;
        }
        return metadata.api && metadata.peer ? 'dual' : metadata.api ? 'api' : 'peer';
    }
}

export interface NodeTypeMetadata {
    name: string;
    balances: number[];
    api: boolean;
    peer: boolean;
    harvesting: boolean;
    voting: boolean;
    demo: boolean;
    services?: boolean;
    nickName: string;
    assembly?: string;
    suggestedCount: number;
}

export const nodesMetadata: Record<NodeMetadataType, NodeTypeMetadata> = {
    VotingDual: {
        name: 'Voting Dual',
        balances: [3_000_000, 150],
        voting: true,
        harvesting: true,
        demo: false,
        api: true,
        peer: true,
        nickName: 'dual',
        suggestedCount: 3,
    },
    VotingPeer: {
        name: 'Voting Peer',
        balances: [3_000_000, 150],
        voting: true,
        harvesting: true,
        demo: false,
        api: false,
        peer: true,
        nickName: 'beacon',
        suggestedCount: 3,
    },
    VotingApi: {
        name: 'Voting Api',
        balances: [3_000_000, 150],
        voting: true,
        harvesting: false,
        demo: false,
        api: false,
        peer: true,
        nickName: 'beacon',
        suggestedCount: 3,
    },
    HarvestingDual: {
        name: 'Harvesting Dual',
        balances: [1_000_000, 150],
        voting: false,
        harvesting: true,
        demo: false,
        api: true,
        peer: true,
        nickName: 'dual',
        suggestedCount: 3,
    },
    HarvestingPeer: {
        name: 'Harvesting Peer',
        balances: [1_000_000, 150],
        voting: false,
        harvesting: true,
        demo: false,
        api: false,
        peer: true,
        nickName: 'beacon',
        suggestedCount: 3,
    },
    Services: {
        name: 'Services',
        balances: [],
        voting: false,
        harvesting: false,
        demo: false,
        api: false,
        peer: false,
        services: true,
        nickName: 'services',
        assembly: Assembly.services,
        suggestedCount: 1,
    },
    Peer: {
        name: 'Peer',
        balances: [1_000, 0],
        voting: false,
        harvesting: false,
        demo: false,
        api: false,
        peer: true,
        nickName: 'peer',
        suggestedCount: 3,
    },
    Api: {
        name: 'Api',
        balances: [1_000, 0],
        voting: false,
        harvesting: false,
        demo: false,
        api: true,
        peer: false,
        nickName: 'api',
        suggestedCount: 3,
    },

    HarvestingDemo: {
        name: 'Harvesting Demo',
        balances: [1_000_000, 150],
        voting: false,
        harvesting: true,
        demo: true,
        api: true,
        peer: true,
        assembly: 'demo',
        nickName: 'demo',
        suggestedCount: 1,
    },
    VotingNonHarvestingPeer: {
        name: 'Non Harvesting Voting Peer',
        balances: [51_000_000, 0],
        voting: true,
        harvesting: false,
        demo: false,
        api: false,
        peer: true,
        nickName: 'peer',
        suggestedCount: 3,
    },
};

export interface NodeInformation {
    number: number;
    nickName: string;
    friendlyName: string;
    assembly: string;
    hostname: string;
    nodeType: NodeMetadataType;
    restProtocol?: RestProtocol;
    balances: number[];
    addresses?: NodeAddresses;
    customPreset?: CustomPreset;
}
