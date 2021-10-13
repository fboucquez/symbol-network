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
import {
    AppVersionService,
    AppVersionVerifyAction,
    Constants,
    Logger,
    LoggerFactory,
    LogType,
    RuntimeService,
    VerifyService,
} from 'symbol-bootstrap';
import { NetworkCommandUtils } from '../utils';

export default class Verify extends Command {
    static description =
        'It tests the installed software in the current computer reporting if there is any missing dependency, invalid version, or software related issue.';
    static examples = [`$ symbol-network verify`];

    static flags = {
        help: NetworkCommandUtils.helpFlag,
    };

    public async run(): Promise<void> {
        NetworkCommandUtils.showBanner();
        const logger: Logger = LoggerFactory.getLogger(LogType.Console);
        const service = new VerifyService(logger);
        const runtimeService = new RuntimeService(logger);
        const appVersionService = new AppVersionService(logger, runtimeService);
        service.actions.push(
            new AppVersionVerifyAction(appVersionService, {
                header: 'Bootstrap Version',
                command: 'symbol-bootstrap --version',
                recommendationUrl: `https://github.com/fboucquez/symbol-bootstrap/`,
                expectedVersion: Constants.VERSION.split('-')[0],
            }),
        );
        const report = await service.createReport();
        service.logReport(report);
    }
}
