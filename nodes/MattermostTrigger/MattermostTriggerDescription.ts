import { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

export const AllOption: INodePropertyOptions = {
	name: 'All',
	value: 'all',
};

const Resources = [
	'Team',
	'Other',
	'Channel',
	'SystemEvent',
	'Role',
	'User',
	'Plugin',
	'Post',
	'UserPreference',
	'Reaction',
	'Thread',
];

export const MattermostResources: INodePropertyOptions[] = Resources.map(
	(it) => {
		return { name: it, value: it };
	}
);

const Events = {
	added_to_team: { title: 'Added to team', resource: 'Team' },
	authentication_challenge: {
		title: 'Authentication challenge',
		resource: 'Other',
	},
	channel_converted: { title: 'Channel converted', resource: 'Channel' },
	channel_created: { title: 'Channel created', resource: 'Channel' },
	channel_deleted: { title: 'Channel deleted', resource: 'Channel' },
	channel_member_updated: {
		title: 'Channel member updated',
		resource: 'Channel',
	},
	channel_updated: { title: 'Channel updated', resource: 'Channel' },
	channel_viewed: { title: 'Channel viewed', resource: 'Channel' },
	config_changed: { title: 'Config changed', resource: 'SystemEvent' },
	delete_team: { title: 'Delete team', resource: 'Team' },
	direct_added: { title: 'Direct added', resource: 'Channel' },
	emoji_added: { title: 'Emoji added', resource: 'Other' },
	ephemeral_message: { title: 'Ephemeral message', resource: 'Post' },
	group_added: { title: 'Group added', resource: 'Channel' },
	hello: { title: 'Hello', resource: 'SystemEvent' },
	leave_team: { title: 'Leave team', resource: 'Team' },
	license_changed: { title: 'License changed', resource: 'SystemEvent' },
	memberrole_updated: { title: 'Member role updated', resource: 'Role' },
	new_user: { title: 'New user', resource: 'User' },
	plugin_disabled: { title: 'Plugin disabled', resource: 'Plugin' },
	plugin_enabled: { title: 'Plugin enabled', resource: 'Plugin' },
	plugin_statuses_changed: {
		title: 'Plugin statuses changed',
		resource: 'Plugin',
	},
	post_deleted: { title: 'Post deleted', resource: 'Post' },
	post_edited: { title: 'Post edited', resource: 'Post' },
	post_unread: { title: 'Post unread', resource: 'Post' },
	posted: { title: 'Posted', resource: 'Post' },
	preference_changed: {
		title: 'Preference changed',
		resource: 'UserPreference',
	},
	preferences_changed: {
		title: 'Preferences changed',
		resource: 'UserPreference',
	},
	preferences_deleted: {
		title: 'Preferences deleted',
		resource: 'UserPreference',
	},
	reaction_added: { title: 'Reaction added', resource: 'Reaction' },
	reaction_removed: { title: 'Reaction removed', resource: 'Reaction' },
	response: { title: 'Response', resource: 'SystemEvent' },
	role_updated: { title: 'Role updated', resource: 'Role' },
	status_change: { title: 'Status change', resource: 'User' },
	typing: { title: 'Typing', resource: 'User' },
	update_team: { title: 'Update team', resource: 'Team' },
	user_added: { title: 'User added', resource: 'User' },
	user_removed: { title: 'User removed', resource: 'User' },
	user_role_updated: { title: 'User role updated', resource: 'Role' },
	user_updated: { title: 'User updated', resource: 'User' },
	dialog_opened: { title: 'Dialog opened', resource: 'Channel' },
	thread_updated: { title: 'Thread updated', resource: 'Thread' },
	thread_follow_changed: {
		title: 'Thread follow changed',
		resource: 'Thread',
	},
	thread_read_changed: { title: 'Thread read changed', resource: 'Thread' },
};

export type MattermostEvent = INodePropertyOptions & {
	resource: string;
};

export const MattermostEvents: MattermostEvent[] = Object.entries(Events).map(
	(it) => {
		return {
			value: it[0],
			name: it[1].title,
			resource: it[1].resource,
		};
	}
);

export const MattermostTriggerOptions: INodeProperties[] = [
	{
		displayName: 'Resources',
		name: 'resources',
		type: 'multiOptions',
		required: true,
		default: [AllOption.value.toString()],
		description: 'Select witch events to receive',
		options: [AllOption, ...MattermostResources],
	},
	{
		// eslint-disable-next-line n8n-nodes-base/node-param-display-name-wrong-for-dynamic-multi-options
		displayName: 'Events',
		name: 'events',
		type: 'multiOptions',
		//required: true,
		default: [],
		// eslint-disable-next-line n8n-nodes-base/node-param-description-wrong-for-dynamic-multi-options
		description: 'Select witch events to receive',
		typeOptions: {
			loadOptionsMethod: 'getEvents',
			loadOptionsDependsOn: ['resources'],
		},
	},
	{
		displayName: 'Custom Events',
		name: 'customevent',
		type: 'string',
		default: '',
		description:
			'Custom events (comma-separated) from https://developers.mattermost.com/api-documentation/#/#websocket-events',
		placeholder: 'Custom events',
		isNodeSetting: true,
	},
];
