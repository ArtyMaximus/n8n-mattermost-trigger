import crypto from 'crypto';
import net from 'net';
import tls from 'tls';
import {
	ILoadOptionsFunctions,
	INodePropertyOptions,
	ITriggerFunctions,
} from 'n8n-workflow';
import WebSocket from 'ws';
import {
	AllOption,
	MattermostEvents,
	MattermostResources,
} from './MattermostTriggerDescription';

export const PACKAGE_VERSION = '1.0.5';

export type ConnectionOwner = {
	shutdown: () => void;
};

const connectionOwners = new Map<string, ConnectionOwner>();

export function connectionKey(baseUrl: string, token: string): string {
	const normalized = baseUrl.toLocaleLowerCase().trim().replace(/\/+$/, '');
	return `${normalized}::${token}`;
}

export function takeOverConnection(key: string, owner: ConnectionOwner): void {
	const previous = connectionOwners.get(key);
	connectionOwners.set(key, owner);
	if (previous && previous !== owner) {
		previous.shutdown();
	}
}

export function releaseConnection(key: string, owner: ConnectionOwner): void {
	if (connectionOwners.get(key) === owner) {
		connectionOwners.delete(key);
	}
}

function wsTarget(baseUrl: string): {
	isSecure: boolean;
	hostname: string;
	port: number;
	path: string;
	hostHeader: string;
} {
	const normalized = baseUrl.toLocaleLowerCase().trim().replace(/\/+$/, '');
	const url = `${normalized.replace('https', 'wss').replace('http', 'ws')}/api/v4/websocket`;
	const parsed = new URL(url);
	const isSecure = parsed.protocol === 'wss:';
	const port = parsed.port ? Number(parsed.port) : isSecure ? 443 : 80;
	const hostHeader =
		(isSecure && port === 443) || (!isSecure && port === 80)
			? parsed.hostname
			: `${parsed.hostname}:${port}`;
	return {
		isSecure,
		hostname: parsed.hostname,
		port,
		path: `${parsed.pathname}${parsed.search}`,
		hostHeader,
	};
}

type SocketWithSetSocket = WebSocket & {
	setSocket: (socket: net.Socket, head: Buffer, options: Record<string, unknown>) => void;
};

/**
 * Handshake over tls/net.connect, then attach `ws` for framing.
 * Bypasses Node `http`/`https` (and n8n 2.36 global agents) used by `new WebSocket(url)`.
 */
export function createMattermostSocket(baseUrl: string, token: string): Promise<WebSocket> {
	return new Promise((resolve, reject) => {
		const { isSecure, hostname, port, path, hostHeader } = wsTarget(baseUrl);
		const secKey = crypto.randomBytes(16).toString('base64');
		let settled = false;
		let handshakeDone = false;
		let buf = Buffer.alloc(0);

		const fail = (error: Error) => {
			if (settled) {
				return;
			}
			settled = true;
			socket.destroy();
			reject(error);
		};

		const writeUpgrade = () => {
			socket.write(
				`GET ${path} HTTP/1.1\r\n` +
					`Host: ${hostHeader}\r\n` +
					`Upgrade: websocket\r\n` +
					`Connection: Upgrade\r\n` +
					`Sec-WebSocket-Key: ${secKey}\r\n` +
					`Sec-WebSocket-Version: 13\r\n` +
					`Authorization: Bearer ${token}\r\n` +
					`\r\n`,
			);
		};

		const socket = isSecure
			? tls.connect({ host: hostname, port, servername: hostname }, writeUpgrade)
			: net.connect({ host: hostname, port }, writeUpgrade);

		socket.setTimeout(30000, () => {
			fail(new Error('Connection timeout'));
		});
		socket.once('error', (error) => {
			fail(error);
		});

		socket.on('data', (chunk: Buffer) => {
			if (handshakeDone) {
				return;
			}
			buf = Buffer.concat([buf, chunk]);
			const headerEnd = buf.indexOf('\r\n\r\n');
			if (headerEnd === -1) {
				if (buf.length > 16 * 1024) {
					fail(new Error('WS handshake too large'));
				}
				return;
			}

			handshakeDone = true;
			socket.pause();
			socket.setTimeout(0);
			socket.removeAllListeners('data');
			socket.removeAllListeners('error');

			const header = buf.subarray(0, headerEnd).toString('latin1');
			const head = buf.subarray(headerEnd + 4);
			const statusLine = header.split('\r\n')[0] ?? '';
			if (!/HTTP\/1\.[01] 101\b/.test(statusLine)) {
				fail(new Error(`WS upgrade failed: ${statusLine}`));
				return;
			}

			try {
				const client = new WebSocket(null as unknown as string) as SocketWithSetSocket;
				if (typeof client.setSocket !== 'function') {
					fail(new Error('ws.setSocket is not available'));
					return;
				}
				client.setSocket(socket, head, {
					maxPayload: 100 * 1024 * 1024,
					skipUTF8Validation: false,
				});
				settled = true;
				resolve(client);
				socket.resume();
			} catch (error) {
				fail(error instanceof Error ? error : new Error(String(error)));
			}
		});
	});
}

export async function getEventsByResource(this: ILoadOptionsFunctions) {
	const resourcesParam = this.getCurrentNodeParameter('resources') as string;
	const resources = resourcesParam
		.toString()
		.split(',')
		.map((it) => it.trim());

	const items: INodePropertyOptions[] = [AllOption];
	MattermostEvents.forEach((it) => {
		if (
			resources.includes(AllOption.value.toString()) ||
			resources.includes(it.resource)
		) {
			items.push(it);
		}
	});
	return items;
}

export function getAllowedEvents(conetxt: ITriggerFunctions): string[] {
	const resources = conetxt.getNodeParameter('resources') as string;
	const events = conetxt.getNodeParameter('events') as string;

	const customevents = (conetxt.getNodeParameter('customevent') as string)
		.toString()
		.split(',')
		.map((it) => it.trim());

	const resourcesesTmp = resources
		.toString()
		.split(',')
		.map((it) => it.trim());
	const resourceList: string[] = (
		resourcesesTmp.includes(AllOption.value.toString())
			? MattermostResources
			: MattermostResources.filter((it) =>
					resourcesesTmp.includes(`${it.value}`)
				)
	).map((it) => `${it.value}`);
	const eventsTmp = events
		.toString()
		.split(',')
		.map((it) => it.trim());
	const eventsAll = MattermostEvents.filter(
		(it) =>
			resourceList.includes(it.resource) ||
			customevents.includes(it.value.toString())
	);
	const eventList = eventsTmp.includes(AllOption.value.toString())
		? eventsAll
		: eventsAll.filter(
				(it) =>
					eventsTmp.includes(`${it.value}`) ||
					customevents.includes(it.value.toString())
			);
	return eventList.map((it) => `${it.value}`);
}
