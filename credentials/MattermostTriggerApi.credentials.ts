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

export type MattermostCredentialData = {
	baseUrl: string;
	authType: MattermostAuthType;
	token: string | null;
	username: string | null;
	password: string | null;
};

export class MattermostTriggerApi implements ICredentialType {
	name = 'mattermostTriggerApi';
	displayName = 'Mattermost Trigger API';
	documentationUrl =
		'https://developers.mattermost.com/integrate/reference/personal-access-token/';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: '',
		},
		/*{
            displayName: 'Auth Type',
            name: 'authType',
            type: 'options',
            options: [
                {
                    name: 'Username & Password',
                    value: 'basicAuth',
                },
                {
                    name: 'Access Token',
                    value: 'accessToken',
                },
            ],
            default: 'basicAuth',
        },
        {
            displayName: 'Username',
            name: 'username',
            type: 'string',
            default: '',
            displayOptions: {
                show: {
                    authType: ['basicAuth'],
                },
            },
        },
        {
            displayName: 'Password',
            name: 'password',
            type: 'string',
            typeOptions: {
                password: true,
            },
            default: '',
            displayOptions: {
                show: {
                    authType: ['basicAuth'],
                },
            },
        },*/
		{
			displayName: 'Token',
			name: 'token',
			type: 'string',
			default: '',
			typeOptions: {
				password: true,
			},
			required: true,
			/*displayOptions: {
                show: {
                    authType: ['accessToken'],
                },
            }*/
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
