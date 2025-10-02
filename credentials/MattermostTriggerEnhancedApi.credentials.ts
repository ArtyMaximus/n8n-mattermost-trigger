import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export enum MattermostAuthType {
	BASIC = 'basicAuth',
	TOKEN = 'accessToken',
}

export type MattermostEnhancedCredentialData = {
	baseUrl: string;
	authType: MattermostAuthType;
	token: string | null;
	username: string | null;
	password: string | null;
};

export class MattermostTriggerEnhancedApi implements ICredentialType {
	name = 'mattermostTriggerEnhancedApi';
	displayName = 'Mattermost Trigger Enhanced API';
	documentationUrl =
		'https://developers.mattermost.com/integrate/reference/personal-access-token/';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: '',
			placeholder: 'https://your-mattermost-server.com',
			description: 'The base URL of your Mattermost server',
		},
		{
			displayName: 'Token',
			name: 'token',
			type: 'string',
			default: '',
			typeOptions: {
				password: true,
			},
			required: true,
			description: 'Bot Token or Personal Access Token for Mattermost API',
		},
	];

	// This allows the credential to be used by other parts of n8n
	// stating how this credential is injected as part of the request
	// An example is the Http Request node that can make generic calls
	// reusing this credential
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '={{"Bearer " + $credentials.token}}',
			},
		},
	};

	// The block below tells how this credential can be tested
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/$/, "")}}/api/v4',
			url: '/users',
		},
	};
}
