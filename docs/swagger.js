const { ROLES } = require('../config/constants');

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
    '/health': {
      get: {
        summary: 'Basic health check',
        description: 'Returns status, uptime, and version. Use for load balancers and readiness probes. Returns 503 if database is disconnected.',
        security: [],
        responses: {
          200: { description: 'Service and database are healthy' },
          503: { description: 'Service unhealthy (e.g. database disconnected)' }
        }
      }
    },
    '/health/detailed': {
      get: {
        summary: 'Detailed health check',
        description: 'Returns database ping latency, process memory, uptime, and safe config flags. Use for debugging and monitoring dashboards.',
        security: [],
        responses: {
          200: {
            description: 'Detailed health info (status may be ok or degraded)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['ok', 'degraded', 'unhealthy'] },
                    timestamp: { type: 'string', format: 'date-time' },
                    version: { type: 'string' },
                    uptime: { type: 'object', properties: { seconds: { type: 'integer' }, human: { type: 'string' } } },
                    database: { type: 'object', properties: { status: { type: 'string' }, latencyMs: { type: 'integer' } } },
                    process: { type: 'object', properties: { pid: { type: 'integer' }, memory: { type: 'object' } } },
                    config: { type: 'object' }
                  }
                }
              }
            }
          },
          503: { description: 'Service unhealthy' }
        }
      }
    },
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
                  role: { type: 'string', enum: ROLES }
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
