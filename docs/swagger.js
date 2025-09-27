module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'KalpOrg Support Platform API',
    version: '1.0.0',
    description: 'REST API for chat, ticketing, analytics, and call orchestration.'
  },
  servers: [
    {
      url: 'http://localhost:4000',
      description: 'Local development server'
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    },
    schemas: {
      Ticket: {
        type: 'object',
        properties: {
          subject: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string', enum: ['Open', 'Pending', 'Hold', 'Closed'] },
          priority: { type: 'string', enum: ['Low', 'Medium', 'High', 'Urgent'] },
          assignedTo: { type: 'string' }
        }
      }
    }
  },
  paths: {
    '/auth/register': {
      post: {
        summary: 'Register a new support agent',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password'],
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string' },
                  password: { type: 'string' },
                  role: { type: 'string', enum: ['agent', 'admin'] }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Agent registered' }
        }
      }
    },
    '/auth/login': {
      post: {
        summary: 'Login and obtain JWT',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Token issued' },
          401: { description: 'Invalid credentials' }
        }
      }
    },
    '/chat/initiate': {
      post: {
        summary: 'Create a customer chat session',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  customer: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      email: { type: 'string' }
                    }
                  },
                  metadata: { type: 'object' },
                  channel: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Chat created' }
        }
      }
    },
    '/chat/message': {
      post: {
        summary: 'Send a chat message via REST',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sessionId', 'senderType', 'body'],
                properties: {
                  sessionId: { type: 'string' },
                  senderType: { type: 'string', enum: ['agent', 'customer', 'system'] },
                  body: { type: 'string' },
                  metadata: { type: 'object' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Message recorded' }
        }
      }
    },
    '/ticket/create': {
      post: {
        summary: 'Create a ticket',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Ticket' }
            }
          }
        },
        responses: {
          201: { description: 'Ticket created' }
        }
      }
    },
    '/ticket/{id}/status': {
      put: {
        summary: 'Update ticket status',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' }
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string', enum: ['Open', 'Pending', 'Hold', 'Closed'] }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Ticket updated' }
        }
      }
    },
    '/ticket/list': {
      get: {
        summary: 'List tickets with optional filters',
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: 'query', name: 'status', schema: { type: 'string' } },
          { in: 'query', name: 'priority', schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Tickets returned' }
        }
      }
    },
    '/call/initiate': {
      post: {
        summary: 'Initiate a call from the agent',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sessionId', 'offer', 'customerSessionId'],
                properties: {
                  sessionId: { type: 'string' },
                  offer: { type: 'object' },
                  customerSessionId: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          201: { description: 'Call initiated' }
        }
      }
    },
    '/call/answer': {
      post: {
        summary: 'Answer a call',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['callId', 'answer'],
                properties: {
                  callId: { type: 'string' },
                  answer: { type: 'object' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Call answered' }
        }
      }
    },
    '/analytics/summary': {
      get: {
        summary: 'Aggregate dashboard metrics',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Analytics payload' }
        }
      }
    },
    '/settings/{accountId}': {
      get: {
        summary: 'Fetch account settings',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'accountId',
            required: true,
            schema: { type: 'string' }
          }
        ],
        responses: {
          200: { description: 'Settings returned' }
        }
      },
      put: {
        summary: 'Update account settings',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'accountId',
            required: true,
            schema: { type: 'string' }
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  businessHours: { type: 'object' },
                  webhookIntegrations: { type: 'array', items: { type: 'object' } },
                  defaultAgentAvailability: { type: 'boolean' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Settings updated' }
        }
      }
    }
  }
};
