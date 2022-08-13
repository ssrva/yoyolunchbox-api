const { dbClient, siloDbClient } = require("./database-client")

const client = dbClient()

module.exports.getActiveSubscription = async (event) => {
  const username = event.pathParameters.username
  const todayDate = new Date().toISOString().substring(0,10);

  const activeSubscriptionQuery = `
    SELECT id, plan, start_date, end_date, free_deliveries_left
    FROM   subscriptions
    WHERE  username = '${username}'
    AND    end_date >= '${todayDate}'
    AND    free_deliveries_left > 0
  `

  try {
    const activeSubscription = await client.query(activeSubscriptionQuery)
    const result = activeSubscription.rows.length > 0 
      ? { ...activeSubscription.rows[0], active: true }
      : { active: false }
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(result)
    }
  } catch(e) {
    console.error(e.message)
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: e.message
    }
  }
}

module.exports.createSubscription = async (event) => {
  const siloClient = siloDbClient();
  const { username, plan, validity, free_deliveries, price } = JSON.parse(event.body)
  const today = new Date();
  const startDate = today.toISOString().substring(0, 10);

  today.setDate(today.getDate() + validity);
  const endDate = today.toISOString().substring(0, 10);

  const createSubscriptionQuery = `
    INSERT INTO subscriptions
    (username, plan, start_date, end_date, free_deliveries_left)
    VALUES ('${username}', '${plan}', '${startDate}', '${endDate}', ${free_deliveries})
  `

  const addTransactionQuery = `
    INSERT INTO
    transactions (username, amount, description)
    VALUES (
      '${username}',
      -${price},
      'Subscription charges for YOYO ${plan} plan.'
    )
  `

  const updateBalanceQuery = `
    UPDATE users
    SET balance = users.balance - ${price}
    WHERE username = '${username}'
  `

  try {
    await siloClient.query("BEGIN")
    await siloClient.query(updateBalanceQuery)
    await siloClient.query(addTransactionQuery)
    await siloClient.query(createSubscriptionQuery)
    await siloClient.query("COMMIT")
    await siloClient.end()
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: "Success"
    }
  } catch(e) {
    console.error(e.message)
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: e.message
    }
  }
}
