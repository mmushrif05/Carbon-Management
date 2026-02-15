const { getDb, respond, optionsResponse } = require('./utils/firebase');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return optionsResponse();
  if (event.httpMethod !== 'GET') return respond(405, { error: 'Method not allowed' });

  try {
    const db = getDb();
    // Quick read to verify connection
    await db.ref('.info/connected').once('value');
    return respond(200, { connected: true });
  } catch (e) {
    return respond(200, { connected: false });
  }
};
