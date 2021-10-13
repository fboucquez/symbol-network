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
import { Command, flags } from '@oclif/command';
import { IOptionFlag } from '@oclif/command/lib/flags';
import { IBooleanFlag } from '@oclif/parser/lib/flags';
import { Constants, LoggerFactory, LogType } from 'symbol-bootstrap';
import { NetworkService } from '../';
import { NetworkCommandUtils } from '../utils';
export default class HealthCheck extends Command {
    static description = `It health checks the nodes of the network once the network is running by performing several remote tests.`;

    static examples = [`$ ${NetworkCommandUtils.CLI_TOOL} healthCheck`];

    static flags: {
        help: IBooleanFlag<void>;
        timeout: IOptionFlag<number>;
        maxBlockDiff: IOptionFlag<number>;
        maxFinalizedBlockDiff: IOptionFlag<number>;
    } = {
        help: NetworkCommandUtils.helpFlag,
        timeout: flags.integer({ description: 'test timeout', default: 10000 }),
        maxBlockDiff: flags.integer({ description: 'max block diff', default: 10 }),
        maxFinalizedBlockDiff: flags.integer({ description: 'max finalized block diff', default: 5 }),
    };

    public async run(): Promise<void> {
        const { flags } = this.parse(HealthCheck);
        NetworkCommandUtils.showBanner();
        const logger = LoggerFactory.getLogger(LogType.Console);
        const workingDir = Constants.defaultWorkingDir;
        return new NetworkService(logger, workingDir).healthCheck(flags);
    }
}
