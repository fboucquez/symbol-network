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
import { Command } from '@oclif/command';
import { IBooleanFlag } from '@oclif/parser/lib/flags';
import { Constants, LoggerFactory, LogType } from 'symbol-bootstrap';
import { NetworkUtils, nodesMetadata, RestProtocol } from '../';
import { NetworkCommandUtils } from '../utils';

export default class ListServices extends Command {
    static description = `It lists all the known services.`;

    static examples = [`$ ${NetworkCommandUtils.CLI_TOOL} listServices`];

    static flags: {
        help: IBooleanFlag<void>;
    } = {
        help: NetworkCommandUtils.helpFlag,
    };

    public async run(): Promise<void> {
        NetworkCommandUtils.showBanner();
        const logger = LoggerFactory.getLogger(LogType.Console);
        const workingDir = Constants.defaultWorkingDir;
        const input = await NetworkUtils.loadNetwork(workingDir);
        input.nodes.forEach((node) => {
            logger.info(`Node: ${node.hostname}`);
            const hostname = node.hostname;
            const metadata = nodesMetadata[node.nodeType];
            if (metadata.peer) {
                logger.info(` - Server Peer -  ${hostname} 7900`);
            }
            if (metadata.api) {
                if (node.restProtocol == RestProtocol.HttpAndHttps) {
                    logger.info(` - Rest - ${NetworkUtils.resolveRestUrl(hostname, RestProtocol.HttpOnly)}`);
                    logger.info(` - Rest - ${NetworkUtils.resolveRestUrl(hostname, RestProtocol.HttpsOnly)}`);
                } else {
                    logger.info(` - Rest -  ${NetworkUtils.resolveRestUrl(hostname, node.restProtocol)}`);
                }
            }
            if (metadata.demo) {
                logger.info(` - Explorer - ${NetworkUtils.resolveExplorerUrl(hostname)}`);
                logger.info(` - Faucet - ${NetworkUtils.resolveFaucetUrl(hostname)}`);
            }
        });
    }
}
