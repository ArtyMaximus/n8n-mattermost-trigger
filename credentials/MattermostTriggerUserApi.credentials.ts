import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export type MattermostCredentialUserData = {
	baseUrl: string;
	username: string | null;
	password: string | null;
};

export class MattermostTriggerUserApi implements ICredentialType {
	name = 'mattermostTriggerUserApi';
	displayName = 'Mattermost Trigger (Basic) API';
	documentationUrl =
		'https://developers.mattermost.com/api-documentation/#/#authentication';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
			required: true,
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			required: true,
			typeOptions: {
				password: true,
			},
			default: '',
		},
	];

	// This allows the credential to be used by other parts of n8n
	// stating how this credential is injected as part of the request
	// An example is the Http Request node that can make generic calls
	// reusing this credential
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			body: {
				login_id: '={{$credentials.username}}',
				password: '={{$credentials.password}}',
			},
		},
	};

	// The block below tells how this credential can be tested
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/$/, "")}}/api/v4',
			url: '/users/login',
		},
	};
}
