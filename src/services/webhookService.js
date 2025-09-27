const crypto = require('crypto');
const axios = require('axios');

exports.dispatch = async ({ integrations = [], event, payload }) => {
  await Promise.all(
    integrations.map(async (integration) => {
      try {
        const body = {
          event,
          payload,
          sentAt: new Date().toISOString()
        };
        const headers = {};
        if (integration.secret) {
          const signature = crypto
            .createHmac('sha256', integration.secret)
            .update(JSON.stringify(body))
            .digest('hex');
          headers['x-rapyd-signature'] = signature;
        }
        await axios.post(integration.url, body, { headers });
      } catch (error) {
        console.error('Failed to deliver webhook', integration.url, error.message);
      }
    })
  );
};
