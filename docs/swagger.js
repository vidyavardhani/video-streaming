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
    },
    '/api/registerHost': {
      post: {
        summary: 'Register a host and generate developer credentials',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string' },
                  password: { type: 'string' }
                },
                required: ['name', 'email', 'password']
              }
            }
          }
        },
        responses: {
          201: { description: 'Host registered' }
        }
      }
    },
    '/api/createClass': {
      post: {
        summary: 'Create a class via developer integration',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  developerKey: { type: 'string' },
                  hostId: { type: 'string' },
                  title: { type: 'string' }
                },
                required: ['developerKey', 'hostId', 'title']
              }
            }
          }
        },
        responses: {
          201: { description: 'Class created' }
        }
      }
    },
    '/api/purchaseCourse': {
      post: {
        summary: 'Register a student for automatic admission',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  studentId: { type: 'string' },
                  classId: { type: 'string' },
                  displayName: { type: 'string' }
                },
                required: ['studentId', 'classId']
              }
            }
          }
        },
        responses: {
          200: { description: 'Student enrolled for auto join' }
        }
      }
    },
    '/api/startClass': {
      post: {
        summary: 'Start a class and auto-admit enrolled students',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  hostId: { type: 'string' },
                  classId: { type: 'string' },
                  developerKey: { type: 'string' }
                },
                required: ['hostId', 'classId']
              }
            }
          }
        },
        responses: {
          200: { description: 'Class started' }
        }
      }
    },
    '/api/class/{id}/participants': {
      get: {
        summary: 'List participants for a class with auto-join metadata',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' }
          }
        ],
        responses: {
          200: { description: 'Participants listed' }
        }
      }
    },
    '/api/developer/summary': {
      get: {
        summary: 'Get developer dashboard summary',
        responses: {
          200: { description: 'Developer summary returned' }
        }
      }
    }
  }
};
