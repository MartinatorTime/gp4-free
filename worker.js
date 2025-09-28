export default {
  async fetch(request, env) {
    return await handleRequest(request, env);
  }
};

async function handleRequest(request, env) {
  const REAL_API_URL = (parseInt(env.REAL_API_URL) || 'https://rsps.westeurope.cloudapp.azure.com');
  const TIME_DEDUCT = parseInt(env.REGISTER_TIME_DEDUCT) || 0;
  const UNIX_DEDUCT = parseInt(env.UNIX_DEDUCT) || 0;
  const REGISTER_DEDUCT = parseInt(env.REGISTER_DEDUCT) || 0;
  const FAKE_TICKET = parseInt(env.FAKE_TICKET) || 0;
  const RANDOM_TICKET_ID = parseInt(env.RANDOM_TICKET_ID) || 0;
  const requestUrl = new URL(request.url);

  const logMessage1 = `--- New Request ---`;
  console.log(logMessage1);
  if (env.D1_LOGS !== '0') await logToD1(env, logMessage1);

  const logMessage2 = `[${new Date().toISOString()}] Received: ${request.method} ${requestUrl.pathname}${requestUrl.search}`;
  console.log(logMessage2);
  if (env.D1_LOGS !== '0') await logToD1(env, logMessage2);

  const logMessage3 = `[${new Date().toISOString()}] Original Headers from Client: ${JSON.stringify(Object.fromEntries(request.headers), null, 2)}`;
  console.log(logMessage3);
  if (env.D1_LOGS !== '0') await logToD1(env, logMessage3);

  let requestBody = null;
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(request.method);
  if (hasBody) {
    try {
      requestBody = await request.clone().text();
      const logMessage4 = `[${new Date().toISOString()}] Incoming Request Body: ${requestBody}`;
      console.log(logMessage4);
      if (env.D1_LOGS !== '0') await logToD1(env, logMessage4);
    } catch (e) {
      const logMessage5 = `[${new Date().toISOString()}] Error reading request body: ${e}`;
      console.error(logMessage5);
      if (env.D1_LOGS !== '0') await logToD1(env, logMessage5);
    }
  }

  const headersToForward = new Headers(request.headers);
  const headersToRemove = [
    'cf-connecting-ip',
    'cf-ipcountry',
    'cf-ray',
    'cf-visitor',
    'x-forwarded-proto',
    'x-real-ip',
    'x-forwarded-for'
  ];

  headersToRemove.forEach(header => {
    headersToForward.delete(header);
  });

  const logMessage6 = `[${new Date().toISOString()}] Sanitized Headers Forwarded to Origin: ${JSON.stringify(Object.fromEntries(headersToForward), null, 2)}`;
  console.log(logMessage6);
  if (env.D1_LOGS !== '0') await logToD1(env, logMessage6);

  const originUrl = REAL_API_URL + requestUrl.pathname + requestUrl.search;

  if (FAKE_TICKET !== 0) {
    if (request.method === 'GET' && requestUrl.pathname === '/api/Tickets/get') {
      const now = Math.floor(Date.now() / 1000);
      const validPeriod = 30 * 24 * 60 * 60; // 30 days in seconds
      const ONE_DAY_IN_SECONDS = 24 * 60 * 60;

      // Set activation time to today at 5:30
      const nowDate = new Date();
      nowDate.setHours(5, 30, 0, 0);
      const activation_time = Math.floor(nowDate.getTime() / 1000);

      // Get saved trips from D1 and find the latest one after activation_time
      let latestTrip = null;
      try {
        const savedTrips = await getSavedTrips(env);
        if (savedTrips.length > 0) {
          const laterTrips = savedTrips.filter(trip => trip.time > activation_time);
          if (laterTrips.length > 0) {
            latestTrip = laterTrips.reduce((latest, current) => 
              current.time > latest.time ? current : latest
            );
          }
        }
      } catch (e) {
        console.error("Error fetching trips from D1:", e);
      }

      const fakeTicketResponse = [{
        "type_name": "timed_month",
        "valid_from": null,
        "valid_till": null,
        "valid_period": null,
        "id": "375ae82f-9610-4f9f-a8c5-ee27b0ad11d0",
        "type_id": "9b980fae-e8b2-4c0b-91ee-3f85d05a2738",
        "purchase_time": now,
        "key_id": "00000000-0000-0000-0000-000000000000",
        "transaction_id": "87d28aff-d989-43ad-95d2-9cac141f3799",
        "batch_number": 40447,
        "is_annulled": false,
        "signed_ids": "Hma4mQm9fWxAZ7Aaua0l9HcyKqaV4/PuoJdaOfFAvQvs3TqeW0umeJ4Om3ghDmegiRZhwf3Tw3ur8iFxuRqJBQ==",
        "activated": activation_time,
        "trips": [
          {
            "id": "8440cbfe-b550-4c7c-97b6-e410940736ba",
            "time": activation_time,
            "vehicle_nr": "17998",
            "ticket_id": "375ae82f-9610-4f9f-a8c5-ee27b0ad11d0",
            "signature": "0jaKtnGWQwahPz1mJRGFpGdwOLNRqVqmhS4Qnsmm2dIM9mPKI5V8pbikhjK1000uTp0L0FIe+USYkxX4K9wrBg=="
          },
          latestTrip
        ].filter(trip => trip !== null),
        "expiry_time": now + validPeriod
      }];

      const logMessage = `[${new Date().toISOString()}] Fake Ticket Response (${latestTrip ? 'using D1 trip' : 'using default trip'}): ${JSON.stringify(fakeTicketResponse)}`;
      console.log(logMessage);
      if (env.D1_LOGS !== '0') await logToD1(env, logMessage);

      return new Response(JSON.stringify(fakeTicketResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  const IS_ACTING_AS_SERVER = env.ACT_AS_SERVER === '1';
  if (IS_ACTING_AS_SERVER) {
    if (request.method === 'POST' && requestUrl.pathname === '/api/Trip/register') {
      if (REGISTER_DEDUCT !== 0) {
        try {
          const requestBodyJson = JSON.parse(requestBody);
          requestBodyJson.time = (parseInt(requestBodyJson.time) - REGISTER_DEDUCT).toString();
          requestBody = JSON.stringify(requestBodyJson);
        } catch (e) {
          console.error("Error applying REGISTER_DEDUCT:", e);
        }
      }
      
      try {
        await createTripsTable(env);
        
        const requestBodyJson = JSON.parse(requestBody);
        
        const responseBody = {
          id: crypto.randomUUID(),
          time: parseInt(requestBodyJson.time),
          vehicle_nr: requestBodyJson.vehicle_nr,
          ticket_id: requestBodyJson.ticket_id,
          signature: requestBodyJson.signature
        };
        const logMessage7 = `[${new Date().toISOString()}] Origin Response Body: ${JSON.stringify(responseBody, null, 2)}`;
        console.log(logMessage7);
        if (env.D1_LOGS !== '0') await logToD1(env, logMessage7);
        
        await saveTripData(env, responseBody);
        
        return new Response(JSON.stringify(responseBody), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (e) {
        const logMessage8 = `[${new Date().toISOString()}] Error parsing request body for /api/Trip/register. Returning 500. ${e}`;
        console.error(logMessage8);
        if (env.D1_LOGS !== '0') await logToD1(env, logMessage8);
        return new Response("Internal Server Error", { status: 500 });
      }
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/Tickets/get') {
      try {
        await createTripsTable(env);
        
        const originResponse = await fetch(REAL_API_URL + '/api/Tickets/get', {
          method: 'GET',
          headers: headersToForward
        });
        
        if (originResponse.ok) {
          const ticketData = await originResponse.json();
          
          const savedTrips = await getSavedTrips(env);
          
          if (ticketData.length > 0 && ticketData[0].trips && savedTrips.length > 0) {
            ticketData[0].trips = [...savedTrips, ...ticketData[0].trips];
          }
          
          const logMessage = `[${new Date().toISOString()}] Modified Response Body for Client: ${JSON.stringify(ticketData)}`;
          console.log(logMessage);
          if (env.D1_LOGS !== '0') await logToD1(env, logMessage);
          
          return new Response(JSON.stringify(ticketData), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } catch (e) {
        const logMessage = `[${new Date().toISOString()}] Error retrieving or modifying ticket data. ${e}`;
        console.error(logMessage);
        if (env.D1_LOGS !== '0') await logToD1(env, logMessage);
      }
    }
  }

  const requestInit = {
    method: request.method,
    headers: headersToForward,
    body: requestBody
  };

  const response = await fetch(originUrl, requestInit);

  const logMessage9 = `[${new Date().toISOString()}] Origin Response Status: ${response.status}`;
  console.log(logMessage9);
  if (env.D1_LOGS !== '0') await logToD1(env, logMessage9);

  const logMessage10 = `[${new Date().toISOString()}] Origin Response Headers: ${JSON.stringify(Object.fromEntries(response.headers), null, 2)}`;
  console.log(logMessage10);
  if (env.D1_LOGS !== '0') await logToD1(env, logMessage10);

  const responseBody = await response.clone().text();
  const logMessage11 = `[${new Date().toISOString()}] Origin Response Body: ${responseBody}`;
  console.log(logMessage11);
  if (env.D1_LOGS !== '0') await logToD1(env, logMessage11);

  if (requestUrl.pathname === '/api/Tickets/get' && response.ok) {
    try {
      let responseBodyObj = JSON.parse(responseBody);

      if (env.ACT_AS_SERVER === '1') {
        const savedTrips = await getSavedTrips(env);
        if (savedTrips.length > 0 && responseBodyObj.length > 0 && responseBodyObj[0].trips) {
          responseBodyObj[0].trips = [...savedTrips, ...responseBodyObj[0].trips];
        }
      }

      if (responseBodyObj.length > 0 && responseBodyObj[0].trips && responseBodyObj[0].trips.length > 0) {
        responseBodyObj[0].trips[0].time -= TIME_DEDUCT;

        if (RANDOM_TICKET_ID !== 0) {
          const logMessageRandom = `[${new Date().toISOString()}] Randomizing vehicle numbers as RANDOM_TICKET_ID is not zero`;
          console.log(logMessageRandom);
          if (env.D1_LOGS !== '0') await logToD1(env, logMessageRandom);

          const prefixes = [17, 16, 57, 35];
          for (let i = 1; i < responseBodyObj[0].trips.length; i++) {
            const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
            const suffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
            responseBodyObj[0].trips[i].vehicle_nr = (prefix + suffix).toString();

            const timeOffset = Math.floor(Math.random() * (10 + 10)) - 10;
            responseBodyObj[0].trips[i].time += timeOffset * 60;
          }
        }
      }

      const modifiedResponseBody = JSON.stringify(responseBodyObj);
      const logMessage12 = `[${new Date().toISOString()}] Modified Response Body for Client: ${modifiedResponseBody}`;
      console.log(logMessage12);
      if (env.D1_LOGS !== '0') await logToD1(env, logMessage12);

      return new Response(modifiedResponseBody, {
        status: response.status,
        headers: response.headers
      });

    } catch (e) {
      const logMessage13 = `[${new Date().toISOString()}] Error modifying JSON for /api/Tickets/get. Returning original response. ${e}`;
      console.error(logMessage13);
      if (env.D1_LOGS !== '0') await logToD1(env, logMessage13);
      return response;
    }
  }

  if (requestUrl.pathname === '/api/Tickets/get_unix_datetime' && response.ok && UNIX_DEDUCT !== 0) {
    try {
      const responseBodyJson = JSON.parse(responseBody);
      if (responseBodyJson.time) {
        responseBodyJson.time -= UNIX_DEDUCT;
      }

      const modifiedResponseBody = JSON.stringify(responseBodyJson);
      const logMessage14 = `[${new Date().toISOString()}] Modified Response Body for Client: ${modifiedResponseBody}`;
      console.log(logMessage14);
      if (env.D1_LOGS !== '0') await logToD1(env, logMessage14);

      return new Response(modifiedResponseBody, {
        status: response.status,
        headers: response.headers
      });

    } catch (e) {
      const logMessage15 = `[${new Date().toISOString()}] Error modifying JSON for /api/Tickets/get_unix_datetime. Returning original response. ${e}`;
      console.error(logMessage15);
      if (env.D1_LOGS !== '0') await logToD1(env, logMessage15);
      return response;
    }
  }

  const logMessage16 = `[${new Date().toISOString()}] Returning original response to client.`;
  console.log(logMessage16);
  if (env.D1_LOGS !== '0') await logToD1(env, logMessage16);
  return response;
}

async function logToD1(env, message) {
  const timestamp = new Date().toISOString();
  const stmt = env.DB.prepare('INSERT INTO logs (timestamp, message) VALUES (?, ?)');
  await stmt.bind(timestamp, message).run();
  await limitLogs(env);
}

async function limitLogs(env) {
  const stmt = env.DB.prepare('DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY id DESC LIMIT 50)');
  await stmt.run();
}

async function createTripsTable(env) {
  try {
    const stmt = env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS trips (
        id TEXT PRIMARY KEY,
        time INTEGER,
        vehicle_nr TEXT,
        ticket_id TEXT,
        signature TEXT
      )
    `);
    await stmt.run();
  } catch (e) {
    console.error("Error creating trips table:", e);
  }
}

async function saveTripData(env, tripData) {
  const stmt = env.DB.prepare('INSERT INTO trips (id, time, vehicle_nr, ticket_id, signature) VALUES (?, ?, ?, ?, ?)');
  await stmt.bind(
    tripData.id,
    tripData.time,
    tripData.vehicle_nr,
    tripData.ticket_id,
    tripData.signature
  ).run();
}

async function getSavedTrips(env) {
  try {
    await createTripsTable(env);
    
    const stmt = env.DB.prepare('SELECT * FROM trips ORDER BY time DESC');
    const result = await stmt.all();
    return result.results || [];
  } catch (e) {
    console.error("Error getting saved trips:", e);
    return [];
  }
}