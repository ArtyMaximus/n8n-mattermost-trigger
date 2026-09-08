import {
	INodeType,
	INodeTypeDescription,
	ITriggerFunctions,
	ITriggerResponse,
	NodeConnectionType,
} from 'n8n-workflow';
import { MattermostEnhancedCredentialData } from '../../credentials/MattermostTriggerEnhancedApi.credentials';

import {
	PACKAGE_VERSION,
	connectionKey,
	createMattermostSocket,
	getAllowedEvents,
	getEventsByResource,
	releaseConnection,
	takeOverConnection,
	type ConnectionOwner,
} from './GenericFunctions';
import { Data, WebSocket } from 'ws';
import { MattermostTriggerOptions } from './MattermostTriggerDescription';

export class MattermostEnhancedTrigger implements INodeType {
	description: INodeTypeDescription = {
		properties: [...MattermostTriggerOptions],
		displayName: 'Mattermost Enhanced Trigger',
		name: 'mattermostEnhancedTrigger',
		icon: 'file:mattermost-logo.svg',
		group: ['trigger'],
		version: 1,
		description: 'Receive Mattermost Events with auto-reconnection and heartbeat monitoring',
		subtitle: '={{$parameter["events"]}}',
		defaults: {
			name: 'Mattermost Trigger Enhanced',
		},
		inputs: [],
		outputs: ['main' as NodeConnectionType],
		credentials: [
			{
				name: 'mattermostTriggerEnhancedApi',
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
		let client: WebSocket | null = null;
		let reconnectTimeout: NodeJS.Timeout | null = null;
		let heartbeatInterval: NodeJS.Timeout | null = null;
		let pongTimeout: NodeJS.Timeout | null = null;
		let isShuttingDown = false;
		let generation = 0;
		let openedAt = 0;

		const credentials = (await this.getCredentials(
			'mattermostTriggerEnhancedApi'
		)) as MattermostEnhancedCredentialData;
		const events = getAllowedEvents(this);
		const slotKey = connectionKey(credentials.baseUrl, credentials.token || '');
		const nodeName = this.getNode().name;
		const workflowId = this.getWorkflow().id ?? 'unknown';

		const RECONNECT_DELAY = 5000;
		const MAX_RECONNECT_DELAY = 60000;
		const HEARTBEAT_INTERVAL = 30000;
		const PONG_TIMEOUT = 10000;
		const SHORT_FLAP_MS = 5000;
		const DEBUG_LOGGING = false;
		let reconnectDelay = RECONNECT_DELAY;
		let reconnectAttempts = 0;

		const log = (message: string, data?: unknown, forceLog = false) => {
			if (DEBUG_LOGGING || forceLog) {
				console.log(
					`[MattermostTrigger][${PACKAGE_VERSION}][${workflowId}/${nodeName}] ${message}`,
					data ?? '',
				);
			}
		};

		const clearTimers = () => {
			if (reconnectTimeout) {
				clearTimeout(reconnectTimeout);
				reconnectTimeout = null;
			}
			if (heartbeatInterval) {
				clearInterval(heartbeatInterval);
				heartbeatInterval = null;
			}
			if (pongTimeout) {
				clearTimeout(pongTimeout);
				pongTimeout = null;
			}
		};

		const cleanup = () => {
			clearTimers();
			if (client) {
				client.removeAllListeners();
				if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
					client.terminate();
				}
				client = null;
			}
		};

		const owner: ConnectionOwner = {
			shutdown: () => {
				isShuttingDown = true;
				generation += 1;
				cleanup();
			},
		};

		const startHeartbeat = () => {
			heartbeatInterval = setInterval(() => {
				if (!client || client.readyState !== WebSocket.OPEN) {
					return;
				}
				try {
					log('Sending heartbeat ping');
					client.ping();

					if (pongTimeout) {
						clearTimeout(pongTimeout);
					}

					pongTimeout = setTimeout(() => {
						log('Pong timeout - terminating connection', undefined, true);
						try {
							client?.terminate();
						} catch {
							// Ignore errors during termination
						}
					}, PONG_TIMEOUT);
				} catch (e) {
					log('Failed to send ping', e);
				}
			}, HEARTBEAT_INTERVAL);
		};

		const sendAuthChallenge = () => {
			if (!client || client.readyState !== WebSocket.OPEN) {
				return;
			}
			const challenge = {
				seq: 1,
				action: 'authentication_challenge',
				data: { token: credentials.token },
			};
			try {
				client.send(JSON.stringify(challenge));
				log('Sent authentication challenge');
			} catch (e) {
				log('Failed to send authentication challenge', e, true);
			}
		};

		const connect = async (expectedGeneration: number): Promise<void> => {
			if (isShuttingDown || expectedGeneration !== generation) {
				return;
			}

			log(
				`Connecting to Mattermost WebSocket... (attempt ${reconnectAttempts + 1})`,
				undefined,
				true,
			);

			const next = await createMattermostSocket(
				credentials.baseUrl,
				credentials.token || '',
			);

			if (isShuttingDown || expectedGeneration !== generation) {
				next.terminate();
				return;
			}

			client = next;
			openedAt = Date.now();

			client.on('message', (data: Data) => {
				try {
					const messageObj = JSON.parse(data.toString());
					const event = messageObj.event;

					if (event === 'hello') {
						log('Received hello event');
						return;
					}

					if (event === 'ping') {
						log('Received ping, sending pong');
						try {
							client?.send(
								JSON.stringify({
									seq: messageObj.seq || 0,
									action: 'pong',
								}),
							);
						} catch (e) {
							log('Failed to send pong', e);
						}
						return;
					}

					if (events.includes(event)) {
						log(`Processing event: ${event}`);
						this.emit([this.helpers.returnJsonArray([messageObj])]);
					}
				} catch (e) {
					log('Failed to parse WebSocket data', {
						raw: data.toString().substring(0, 200),
						error: e,
					});
				}
			});

			client.on('pong', () => {
				log('Received heartbeat pong');
				if (pongTimeout) {
					clearTimeout(pongTimeout);
					pongTimeout = null;
				}
			});

			client.on('close', (code, reason) => {
				const livedMs = openedAt ? Date.now() - openedAt : 0;
				log(
					'WebSocket connection closed',
					{
						code,
						reason: reason?.toString(),
						attempts: reconnectAttempts,
						livedMs,
					},
					true,
				);
				cleanup();

				if (!isShuttingDown && expectedGeneration === generation) {
					if (livedMs >= SHORT_FLAP_MS) {
						reconnectDelay = RECONNECT_DELAY;
						reconnectAttempts = 0;
					}
					scheduleReconnect();
				}
			});

			client.on('error', (error) => {
				log('WebSocket error', { error, attempts: reconnectAttempts }, true);
			});

			log('WebSocket connection established', undefined, true);
			sendAuthChallenge();
			startHeartbeat();
		};

		const scheduleReconnect = () => {
			if (isShuttingDown) {
				return;
			}

			const expectedGeneration = generation;
			reconnectAttempts++;
			log(
				`Scheduling reconnect in ${reconnectDelay}ms (attempt ${reconnectAttempts})`,
				undefined,
				true,
			);

			reconnectTimeout = setTimeout(async () => {
				if (isShuttingDown || expectedGeneration !== generation) {
					return;
				}
				try {
					await connect(expectedGeneration);
				} catch (error) {
					log('Reconnect failed', { error, attempts: reconnectAttempts }, true);
					reconnectDelay = Math.min(
						reconnectDelay * 2 + Math.random() * 1000,
						MAX_RECONNECT_DELAY,
					);
					if (!isShuttingDown && expectedGeneration === generation) {
						scheduleReconnect();
					}
				}
			}, reconnectDelay);
		};

		takeOverConnection(slotKey, owner);

		try {
			await connect(generation);
		} catch (error) {
			log('Initial connection failed', error, true);
			scheduleReconnect();
		}

		const closeFunction = async () => {
			log('Shutting down Mattermost trigger...', undefined, true);
			owner.shutdown();
			releaseConnection(slotKey, owner);
		};

		const manualTriggerFunction = async () => {
			log('Manual trigger requested', undefined, true);
			if (client && client.readyState === WebSocket.OPEN) {
				log('Connection already active');
				return;
			}

			isShuttingDown = false;
			generation += 1;
			reconnectDelay = RECONNECT_DELAY;
			reconnectAttempts = 0;
			takeOverConnection(slotKey, owner);

			try {
				await connect(generation);
			} catch (error) {
				log('Manual trigger connection failed', error, true);
				scheduleReconnect();
			}
		};

		return {
			closeFunction,
			manualTriggerFunction,
		};
	}
}
