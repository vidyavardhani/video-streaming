module.exports = {
  title: 'Mobile integration endpoints',
  version: '1.0.0',
  description:
    'Reference for the lightweight class-management endpoints exposed for mobile and webview integrations.',
  headers: {
    hostToken: "When acting as the host without a JWT, send the class's host access token in the `X-Class-Host-Token` header."
  },
  endpoints: [
    {
      name: 'Create class',
      method: 'POST',
      path: '/classes',
      auth: 'Teacher JWT required',
      body: {
        title: 'string'
      },
      response: {
        classCode: 'string',
        meetingLink: 'string',
        meetingCode: 'string',
        hostToken: 'string',
        hostStartLink: 'string',
        studentJoinLink: 'string',
        studentJoinLinkTemplate: 'string'
      }
    },
    {
      name: 'Start class',
      method: 'PATCH',
      path: '/classes/{code}/start',
      auth: 'Host JWT or X-Class-Host-Token header',
      description: 'Transitions the class to live and admits all auto-join participants.'
    },
    {
      name: 'End class',
      method: 'PATCH',
      path: '/classes/{code}/end',
      auth: 'Host JWT or X-Class-Host-Token header',
      description: 'Ends the class session, clears the lobby and stops any active recording.'
    },
    {
      name: 'Join class',
      method: 'POST',
      path: '/classes/{code}/join',
      auth: 'Optional',
      body: {
        displayName: 'string'
      },
      notes: [
        'Students can supply the display name in the request body.',
        'The host token is ignored on this route; it is only required for host-only actions.'
      ]
    }
  ]
};
