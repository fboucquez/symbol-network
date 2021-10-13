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

import { join } from 'path';
import { BootstrapService, Logger, Password } from 'symbol-bootstrap';
import { KeyStore, NetworkUtils } from '.';
import { NetworkAccountResolver } from './NetworkAccountResolver';

export interface LinkNodesParams {
    password: Password;
    unlink: boolean;
    maxFee: number | undefined;
    url: string | undefined;
    serviceProviderPublicKey?: string;
}

export class NetworkLinkService {
    constructor(private readonly logger: Logger, private readonly workingDir: string, private readonly keyStore: KeyStore) {}

    public async linkNodes({ password, unlink, maxFee, serviceProviderPublicKey, url }: LinkNodesParams): Promise<void> {
        const input = await NetworkUtils.loadNetwork(this.workingDir);
        const service = new BootstrapService(this.logger);
        for (const node of input.nodes) {
            const accountResolver = new NetworkAccountResolver(this.logger, node, this.keyStore);
            const nodeFolder = join('nodes', `node-${NetworkUtils.zeroPad(node.number, 3)}`);
            this.logger.info('');
            this.logger.info(`Linking node ${node.number} ${node.friendlyName}`);
            this.logger.info('');
            const bootstrapTargetFolder = join(nodeFolder, 'target');
            await service.link({
                unlink,
                maxFee,
                accountResolver,
                password: password === false ? undefined : password,
                ready: true,
                serviceProviderPublicKey: serviceProviderPublicKey,
                url: url || 'http://locahost:3000',
                useKnownRestGateways: url == undefined,
                target: bootstrapTargetFolder,
            });
            this.logger.info('');
            this.logger.info('-----');
        }
    }
}
