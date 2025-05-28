/*import {
	IExecuteFunctions,
} from 'n8n-core';*/

import {
	ApplicationError,
	INodeType,
	INodeTypeDescription,
	ITriggerFunctions,
	ITriggerResponse,
	NodeConnectionType,
} from 'n8n-workflow';
import {
	//MattermostAuthType,
	MattermostCredentialData,
} from '../../credentials/MattermostTriggerApi.credentials';

import {
	getAllowedEvents,
	getEventsByResource,
	InitClient,
} from './GenericFunctions';
import { Data, WebSocket } from 'ws';
import { MattermostTriggerOptions } from './MattermostTriggerDescription';

export class MattermostTrigger implements INodeType {
	description: INodeTypeDescription = {
		// Basic node details will go here
		properties: [
			// Resources and operations will go here
			...MattermostTriggerOptions,
		],
		displayName: 'Mattermost Event Trigger',
		name: 'mattermostTrigger',
		icon: 'file:mattermost-logo.svg',
		group: ['trigger'],
		version: 1,
		description: 'Receive Mattermost Events',
		defaults: {
			name: 'Mattermost Trigger',
		},
		inputs: [],
		outputs: ['main' as NodeConnectionType],
		credentials: [
			{
				name: 'mattermostTriggerApi',
				required: true,
			},
		],
	};

	methods = {
		loadOptions: {
			getEvents: getEventsByResource,
		},
	};

	async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
		let client: WebSocket;
		const credentials = (await this.getCredentials(
			'mattermostTriggerApi'
		)) as MattermostCredentialData;
		const events = getAllowedEvents(this);

		const startConsumer = async () => {
			// Establish the Websocket connection and set up event listeners

			//Create client
			client = InitClient(credentials.baseUrl, credentials.token || '');

			//Subscribe
			client.on('message', (data: Data) => {
				try {
					const messageObj = JSON.parse(data.toString());
					const event = messageObj.event;
					if (events.includes(event)) {
						//console.log(
						//`Send event=${event}; allowedevents=${events};`
						//);
						this.emit([this.helpers.returnJsonArray([messageObj])]);
					} else {
						//console.log(
						//`Skipped event=${event}; allowedevents=${events};`
						//);
					}
				} catch (e) {
					console.error(e);
					throw new ApplicationError(
						`Failed to parse WebSocket data: ${data}`
					);
				}
			});

			client.on('error', (error) => {
				throw new ApplicationError(`WebSocket error: ${error}`);
			});
		};
		await startConsumer();

		const closeFunction = async () => {
			// Clean up any resources that were allocated during the connection
			client.close();
		};

		const manualTriggerFunction = async () => {
			// Trigger the node manually
			await startConsumer();
		};

		return {
			closeFunction: closeFunction,
			manualTriggerFunction: manualTriggerFunction,
		};
	}
}
