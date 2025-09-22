export default {
  async fetch(request, env) {
    return await handleRequest(request, env);
  }
};

async function handleRequest(request, env) {
  const REAL_API_URL = 'https://rsps.westeurope.cloudapp.azure.com';
  const TIME_DEDUCT = parseInt(env.TIME) || 0;
  const UNIX_DEDUCT = parseInt(env.UNIX_DEDUCT) || 0;
  const REGISTER_DEDUCT = parseInt(env.REGISTER_DEDUCT) || 0; // New environment variable
  const FAKE_TICKET = parseInt(env.FAKE_TICKET) || 0; // New environment variable for fake ticket
  const requestUrl = new URL(request.url);

  // --- 1. Log Incoming Request from Client ---
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

  // --- 2. Sanitize Headers Before Forwarding ---
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

  // --- 3. Forward the Sanitized Request to Origin Server ---
  const originUrl = REAL_API_URL + requestUrl.pathname + requestUrl.search;

  // Check if FAKE_TICKET is enabled and intercept GET /api/Tickets/get
  // This check is placed first to ensure it takes precedence and no request is sent to origin server
  if (FAKE_TICKET !== 0 && request.method === 'GET' && requestUrl.pathname === '/api/Tickets/get') {
    const now = Math.floor(Date.now() / 1000);
    const validPeriod = 30 * 24 * 60 * 60; // 30 days in seconds
    const ONE_DAY_IN_SECONDS = 24 * 60 * 60; // 86400 seconds
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
      "activated": now - ONE_DAY_IN_SECONDS, // Set activated time to 1 day before current time
      "trips": [
        {
          "id": "8440cbfe-b550-4c7c-97b6-e410940736ba",
          "time": now + validPeriod,
          "vehicle_nr": "17998",
          "ticket_id": "375ae82f-9610-4f9f-a8c5-ee27b0ad11d0",
          "signature": "0jaKtnGWQwahPz1mJRGFpGdwOLNRqVqmhS4Qnsmm2dIM9mPKI5V8pbikhjK1000uTp0L0FIe+USYkxX4K9wrBg=="
        }
      ],
      "expiry_time": now + validPeriod
    }];

    const logMessage = `[${new Date().toISOString()}] Fake Ticket Response (no request to origin server): ${JSON.stringify(fakeTicketResponse)}`;
    console.log(logMessage);
    if (env.D1_LOGS !== '0') await logToD1(env, logMessage);

    return new Response(JSON.stringify(fakeTicketResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Check if ACT_AS_SERVER is set to 1 and intercept POST /api/Trip/register
  if (env.ACT_AS_SERVER === '1' && request.method === 'POST' && requestUrl.pathname === '/api/Trip/register') {
    // Apply REGISTER_DEDUCT only when ACT_AS_SERVER is 1
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
      // Ensure trips table exists
      await createTripsTable(env);
      
      const requestBodyJson = JSON.parse(requestBody);
      
      const responseBody = {
        id: crypto.randomUUID(),
        time: parseInt(requestBodyJson.time), // Ensure time is an integer
        vehicle_nr: requestBodyJson.vehicle_nr,
        ticket_id: requestBodyJson.ticket_id,
        signature: requestBodyJson.signature
      };
      const logMessage7 = `[${new Date().toISOString()}] Origin Response Body: ${JSON.stringify(responseBody, null, 2)}`; // Pretty print the response body
      console.log(logMessage7);
      if (env.D1_LOGS !== '0') await logToD1(env, logMessage7);
      
      // Save the trip data to D1 for later use
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

  // Check if ACT_AS_SERVER is set to 1 and intercept GET /api/Tickets/get
  if (env.ACT_AS_SERVER === '1' && request.method === 'GET' && requestUrl.pathname === '/api/Tickets/get') {
    try {
      // Ensure trips table exists
      await createTripsTable(env);
      
      // Fetch real ticket data from the origin server
      const originResponse = await fetch(REAL_API_URL + '/api/Tickets/get', {
        method: 'GET',
        headers: headersToForward
      });
      
      if (originResponse.ok) {
        const ticketData = await originResponse.json();
        
        // Get saved trips from D1
        const savedTrips = await getSavedTrips(env);
        
        // Add saved trips to the ticket data
        if (ticketData.length > 0 && ticketData[0].trips && savedTrips.length > 0) {
          // Add saved trips to the beginning of the trips array
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

  const requestInit = {
    method: request.method,
    headers: headersToForward,
    // Add the body back if it exists
    body: requestBody
  };

  const response = await fetch(originUrl, requestInit);

  // --- 4. Log the Response from Origin Server ---
  const logMessage9 = `[${new Date().toISOString()}] Origin Response Status: ${response.status}`;
  console.log(logMessage9);
  if (env.D1_LOGS !== '0') await logToD1(env, logMessage9);

  const logMessage10 = `[${new Date().toISOString()}] Origin Response Headers: ${JSON.stringify(Object.fromEntries(response.headers), null, 2)}`;
  console.log(logMessage10);
  if (env.D1_LOGS !== '0') await logToD1(env, logMessage10);

  // Clone the response to be able to read the body for logging and for subsequent logic.
  const responseBody = await response.clone().text();
  const logMessage11 = `[${new Date().toISOString()}] Origin Response Body: ${responseBody}`;
  console.log(logMessage11);
  if (env.D1_LOGS !== '0') await logToD1(env, logMessage11);

  // --- 5. Conditionally Modify the Response ---
  if (requestUrl.pathname === '/api/Tickets/get' && response.ok) {
    try {
      const responseBodyJson = JSON.parse(responseBody);

      if (env.ACT_AS_SERVER === '1') {
        // When acting as server, get saved trips from D1 and prepend them
        const savedTrips = await getSavedTrips(env);
        if (savedTrips.length > 0 && responseBodyJson.length > 0 && responseBodyJson[0].trips) {
          responseBodyJson[0].trips = [...savedTrips, ...responseBodyJson[0].trips];
        }
      } else if (responseBodyJson.length > 0 && responseBodyJson[0].trips && responseBodyJson[0].trips.length > 0) {
        // Modify the first trip's time
        responseBodyJson[0].trips[0].time -= TIME_DEDUCT;

        // Modify the vehicle_nr of all subsequent trips
        const prefixes = [17, 16, 57, 35];
        for (let i = 1; i < responseBodyJson[0].trips.length; i++) {
          const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
          const suffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
          responseBodyJson[0].trips[i].vehicle_nr = (prefix + suffix).toString();
        }
      }

      const modifiedResponseBody = JSON.stringify(responseBodyJson);
      const logMessage12 = `[${new Date().toISOString()}] Modified Response Body for Client: ${modifiedResponseBody}`;
      console.log(logMessage12);
      if (env.D1_LOGS !== '0') await logToD1(env, logMessage12);

      // Return a new response with the modified body
      return new Response(modifiedResponseBody, {
        status: response.status,
        headers: response.headers
      });

    } catch (e) {
      const logMessage13 = `[${new Date().toISOString()}] Error modifying JSON for /api/Tickets/get. Returning original response. ${e}`;
      console.error(logMessage13);
      if (env.D1_LOGS !== '0') await logToD1(env, logMessage13);
      // If parsing or modification fails, return the original response to avoid errors.
      return response;
    }
  }

  // Modify the response for GET /api/Tickets/get_unix_datetime
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

      // Return a new response with the modified body
      return new Response(modifiedResponseBody, {
        status: response.status,
        headers: response.headers
      });

    } catch (e) {
      const logMessage15 = `[${new Date().toISOString()}] Error modifying JSON for /api/Tickets/get_unix_datetime. Returning original response. ${e}`;
      console.error(logMessage15);
      if (env.D1_LOGS !== '0') await logToD1(env, logMessage15);
      // If parsing or modification fails, return the original response to avoid errors.
      return response;
    }
  }

  // --- 6. Return the Original Response for all other requests ---
  const logMessage16 = `[${new Date().toISOString()}] Returning original response to client.`;
  console.log(logMessage16);
  if (env.D1_LOGS !== '0') await logToD1(env, logMessage16);
  return response;
}

// Function to log messages to D1
async function logToD1(env, message) {
  const timestamp = new Date().toISOString();
  const stmt = env.DB.prepare('INSERT INTO logs (timestamp, message) VALUES (?, ?)');
  await stmt.bind(timestamp, message).run();
  await limitLogs(env);
}

// Function to limit logs to the last 50 entries
async function limitLogs(env) {
  const stmt = env.DB.prepare('DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY id DESC LIMIT 50)');
  await stmt.run();
}

// Function to create trips table if it doesn't exist
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

// Function to save trip data to D1
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

// Function to get saved trips from D1
async function getSavedTrips(env) {
  try {
    // Ensure trips table exists
    await createTripsTable(env);
    
    const stmt = env.DB.prepare('SELECT * FROM trips ORDER BY time DESC');
    const result = await stmt.all();
    return result.results || [];
  } catch (e) {
    console.error("Error getting saved trips:", e);
    return [];
  }
}