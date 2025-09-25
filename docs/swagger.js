module.exports = {
  openapi: '3.0.0',
  info: {
    title: 'Video Streaming API',
    version: '1.0.0',
    description: 'API documentation for Google Meet like live class platform'
  },
  servers: [
    {
      url: 'http://64.227.152.29:5000',
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
    '/classes/{code}/start': {
      patch: {
        summary: 'Start a class'
      }
    },
    '/classes/{code}/end': {
      patch: {
        summary: 'End a class'
      }
    },
    '/classes/{code}/join': {
      post: {
        summary: 'Join class lobby'
      }
    },
    '/classes/{code}/admit': {
      post: {
        summary: 'Admit student from lobby'
      }
    },
    '/classes/{code}/remove': {
      post: {
        summary: 'Remove participant'
      }
    },
    '/classes/{code}/polls': {
      post: {
        summary: 'Create a class poll'
      }
    },
    '/classes/{code}/polls/vote': {
      post: {
        summary: 'Vote in the active poll'
      }
    },
    '/classes/{code}/polls/close': {
      post: {
        summary: 'Close the active poll'
      }
    },
    '/classes/{code}/questions': {
      post: {
        summary: 'Submit a Q&A question'
      }
    },
    '/classes/{code}/questions/{questionId}': {
      patch: {
        summary: 'Answer a Q&A question'
      }
    },
    '/classes/{code}/whiteboard/clear': {
      post: {
        summary: 'Clear whiteboard strokes'
      }
    },
    '/classes/{code}/recording/start': {
      post: {
        summary: 'Start server-side recording'
      }
    },
    '/classes/{code}/recording/stop': {
      post: {
        summary: 'Stop recording and upload to S3'
      }
    },
    '/classes/mine': {
      get: {
        summary: 'List classes for the authenticated teacher'
      }
    },
    '/classes/{code}': {
      get: {
        summary: 'Get class details'
      }
    },
    '/classes/live': {
      get: {
        summary: 'Get live classes'
      }
    },
    '/chat/{code}': {
      get: {
        summary: 'Fetch chat history'
      },
      post: {
        summary: 'Send message'
      }
    }
  }
};
