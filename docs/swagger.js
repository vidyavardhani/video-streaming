module.exports = {
  openapi: '3.0.0',
  info: {
    title: 'Video Streaming API',
    version: '1.0.0',
    description: 'API documentation for Google Meet like live class platform'
  },
  servers: [
    {
      url: 'http://localhost:4000',
      description: 'Local server'
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    }
  },
  security: [
    {
      bearerAuth: []
    }
  ],
  paths: {
    '/auth/register': {
      post: {
        summary: 'Register a new user',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string' },
                  password: { type: 'string' },
                  role: { type: 'string', enum: ['teacher', 'student'] }
                },
                required: ['name', 'email', 'password', 'role']
              }
            }
          }
        },
        responses: {
          201: { description: 'User created' }
        }
      }
    },
    '/auth/login': {
      post: {
        summary: 'Login and obtain a JWT token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Authenticated successfully' }
        }
      }
    },
    '/auth/me': {
      get: {
        summary: 'Get current user profile',
        responses: {
          200: { description: 'User profile returned' }
        }
      }
    },
    '/classes': {
      post: {
        summary: 'Create a new class',
        responses: {
          201: { description: 'Class created' }
        }
      }
    },
    '/classes/{id}/start': {
      patch: {
        summary: 'Start a class'
      }
    },
    '/classes/{id}/end': {
      patch: {
        summary: 'End a class'
      }
    },
    '/classes/{id}/join': {
      post: {
        summary: 'Join class lobby'
      }
    },
    '/classes/{id}/admit': {
      post: {
        summary: 'Admit student from lobby'
      }
    },
    '/classes/{id}/remove': {
      post: {
        summary: 'Remove participant'
      }
    },
    '/classes/mine': {
      get: {
        summary: 'List classes for the authenticated teacher'
      }
    },
    '/classes/{id}': {
      get: {
        summary: 'Get class details'
      }
    },
    '/classes/live': {
      get: {
        summary: 'Get live classes'
      }
    },
    '/chat/{classId}': {
      get: {
        summary: 'Fetch chat history'
      },
      post: {
        summary: 'Send message'
      }
    }
  }
};
