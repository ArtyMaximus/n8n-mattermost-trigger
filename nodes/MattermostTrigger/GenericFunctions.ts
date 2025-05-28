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

/*
import axios from 'axios';

export async function getToken(baseURl: string, username: string, password: string){
    const response = await axios.post(`${baseURl}/api/v4/users/login`, {
        "login_id": username,
        "password": password
    })
    if(response.status < 200 || response.status > 299 ){
        throw new Error(`Token request failed, status: ${response.status} - ${response.statusText}`)
    }
    console.log(response.headers?.token)
    return response.headers?.token
}
*/

export function InitClient(baseUrl: string, token: string): WebSocket {
	const wsUrl = `${baseUrl.toLocaleLowerCase().trim().replace('https', 'wss').replace('http', 'ws')}/api/v4/websocket`;
	return new WebSocket(wsUrl, {
		headers: {
			Authorization: `Bearer ${token}`,
		},
	});
}

export async function getEventsByResource(this: ILoadOptionsFunctions) {
	const resourcesParam = this.getCurrentNodeParameter('resources') as string;
	const resources = resourcesParam
		.toString()
		.split(',')
		.map((it) => it.trim());
	//console.log('resources', resources);

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
