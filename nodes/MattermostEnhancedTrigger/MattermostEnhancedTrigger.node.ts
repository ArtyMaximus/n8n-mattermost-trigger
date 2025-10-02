/*import {
	IExecuteFunctions,
} from 'n8n-core';*/

import {
	INodeType,
	INodeTypeDescription,
	ITriggerFunctions,
	ITriggerResponse,
	NodeConnectionType,
} from 'n8n-workflow';
import {
	//MattermostAuthType,
	MattermostEnhancedCredentialData,
} from '../../credentials/MattermostTriggerEnhancedApi.credentials';

import {
	getAllowedEvents,
	getEventsByResource,
	InitClient,
} from './GenericFunctions';
import { Data, WebSocket } from 'ws';
import { MattermostTriggerOptions } from './MattermostTriggerDescription';

export class MattermostEnhancedTrigger implements INodeType {
	description: INodeTypeDescription = {
		// Basic node details will go here
		properties: [
			// Resources and operations will go here
			...MattermostTriggerOptions,
		],
		displayName: 'Mattermost Enhanced Trigger',
		name: 'mattermostEnhancedTrigger',
		icon: 'file:mattermost-logo.svg',
		group: ['trigger'],
		version: 1,
		description: 'Receive Mattermost Events with auto-reconnection and heartbeat monitoring',
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

		const credentials = (await this.getCredentials(
			'mattermostTriggerEnhancedApi'
		)) as MattermostEnhancedCredentialData;
		const events = getAllowedEvents(this);

		// Connection settings
		const RECONNECT_DELAY = 5000; // 5s
		const MAX_RECONNECT_DELAY = 60000; // 60s
		const HEARTBEAT_INTERVAL = 30000; // 30s
		const PONG_TIMEOUT = 10000; // 10s to wait for pong
		const DEBUG_LOGGING = false; // Set to true for debug logs
		let reconnectDelay = RECONNECT_DELAY;
		let reconnectAttempts = 0;

		const log = (message: string, data?: unknown, forceLog = false) => {
			if (DEBUG_LOGGING || forceLog) {
				console.log(`[MattermostTrigger] ${message}`, data ?? '');
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

		const startHeartbeat = () => {
			heartbeatInterval = setInterval(() => {
				if (!client || client.readyState !== WebSocket.OPEN) {
					return;
				}
				try {
					log('Sending heartbeat ping');
					client.ping();
					
					// Clear previous pong timeout
					if (pongTimeout) {
						clearTimeout(pongTimeout);
					}
					
					// Set timeout for pong response
					pongTimeout = setTimeout(() => {
						log('Pong timeout - terminating connection', undefined, true);
						try {
							client?.terminate();
						} catch (e) {
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

		const connect = async (): Promise<void> => {
			return new Promise((resolve, reject) => {
				try {
					log(`Connecting to Mattermost WebSocket... (attempt ${reconnectAttempts + 1})`, undefined, true);
					client = InitClient(credentials.baseUrl, credentials.token || '');

					const connectionTimeout = setTimeout(() => {
						log('Connection timeout', undefined, true);
						reject(new Error('Connection timeout'));
					}, 30000);

					client.on('open', () => {
						clearTimeout(connectionTimeout);
						log('WebSocket connection established', undefined, true);
						reconnectDelay = RECONNECT_DELAY;
						reconnectAttempts = 0;
						
						// Send authentication challenge
						sendAuthChallenge();
						
						// Start heartbeat
						startHeartbeat();
						resolve();
					});

					client.on('message', (data: Data) => {
						try {
							const messageObj = JSON.parse(data.toString());
							const event = messageObj.event;

							// Handle special events
							if (event === 'hello') {
								log('Received hello event');
								return;
							}

							if (event === 'ping') {
								log('Received ping, sending pong');
								try {
									client?.send(JSON.stringify({ 
										seq: messageObj.seq || 0, 
										action: 'pong' 
									}));
								} catch (e) {
									log('Failed to send pong', e);
								}
								return;
							}

							// Process regular events
							if (events.includes(event)) {
								log(`Processing event: ${event}`);
								this.emit([this.helpers.returnJsonArray([messageObj])]);
							} else {
								// Silently skip non-allowed events
							}
						} catch (e) {
							log('Failed to parse WebSocket data', { 
								raw: data.toString().substring(0, 200), 
								error: e 
							});
						}
					});

					client.on('pong', () => {
						log('Received heartbeat pong');
						// Clear pong timeout - connection is alive
						if (pongTimeout) {
							clearTimeout(pongTimeout);
							pongTimeout = null;
						}
					});

					client.on('close', (code, reason) => {
						clearTimeout(connectionTimeout);
						log('WebSocket connection closed', { 
							code, 
							reason: reason?.toString(),
							attempts: reconnectAttempts 
						}, true);
						cleanup();
						
						if (!isShuttingDown) {
							scheduleReconnect();
						}
					});

					client.on('error', (error) => {
						clearTimeout(connectionTimeout);
						log('WebSocket error', { error, attempts: reconnectAttempts }, true);
						cleanup();
						reject(error);
					});
				} catch (error) {
					log('Failed to create WebSocket connection', error);
					reject(error);
				}
			});
		};

		const scheduleReconnect = () => {
			if (isShuttingDown) {
				return;
			}
			
			reconnectAttempts++;
			log(`Scheduling reconnect in ${reconnectDelay}ms (attempt ${reconnectAttempts})`, undefined, true);
			
			reconnectTimeout = setTimeout(async () => {
				try {
					await connect();
				} catch (error) {
					log('Reconnect failed', { error, attempts: reconnectAttempts }, true);
					// Exponential backoff with jitter
					reconnectDelay = Math.min(
						reconnectDelay * 2 + Math.random() * 1000, 
						MAX_RECONNECT_DELAY
					);
					scheduleReconnect();
				}
			}, reconnectDelay);
		};

		// Initial connection
		try {
			await connect();
		} catch (error) {
			log('Initial connection failed', error, true);
			scheduleReconnect();
		}

		const closeFunction = async () => {
			log('Shutting down Mattermost trigger...', undefined, true);
			isShuttingDown = true;
			cleanup();
		};

		const manualTriggerFunction = async () => {
			log('Manual trigger requested', undefined, true);
			if (client && client.readyState === WebSocket.OPEN) {
				log('Connection already active');
				return;
			}
			
			// Reset state for manual trigger
			isShuttingDown = false;
			reconnectDelay = RECONNECT_DELAY;
			reconnectAttempts = 0;
			
			try {
				await connect();
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
