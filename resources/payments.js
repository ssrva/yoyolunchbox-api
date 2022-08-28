const axios = require("axios")
const { siloDbClient, dbClient } = require("./database-client")
var AWS = require('aws-sdk')

getCashfreeCredentials = async (environment) => {
  const client = new AWS.SecretsManager({
    region: "us-east-1"
  });
  if (environment === "TEST") {
    const secret = await client.getSecretValue({SecretId: "cashfree_credentials_development"}).promise();
    return JSON.parse(secret.SecretString);
  } else {
    const secret = await client.getSecretValue({SecretId: "cashfree_credentials"}).promise();
    return JSON.parse(secret.SecretString);
  }
}

module.exports.createPaymentsOrder = async (event) => {
  const { id, amount, environment } = JSON.parse(event.body)
  const cashFreeCredentials = await getCashfreeCredentials(environment || "PROD")

  console.log(JSON.stringify(cashFreeCredentials))

  const headers = {
    "Content-Type": "application/json",
    "x-client-id": cashFreeCredentials.cashfree_client_id,
    "x-client-secret": cashFreeCredentials.cashfree_secret,
  }
  let endpoint = "https://api.cashfree.com/api/v2/cftoken/order"
  if (environment === "TEST") {
    endpoint = "https://test.cashfree.com/api/v2/cftoken/order"
  }

  try {
    const response = await axios.post(endpoint, {
      orderId: id,
      orderAmount: amount,
      orderCurrency: "INR"
    }, {
      headers
    })

    const result = {
      orderId: id,
      orderAmount: amount,
      orderCurrency: "INR",
      cfToken: response.data.cftoken,
    }
    return {
      statusCode: 200,
      body: JSON.stringify(result)
    }
  } catch(e) {
    console.log(JSON.stringify(e))
    return {
      statusCode: 400,
      body: e.message
    }
  }

}

module.exports.updateWalletBalance = async(event) => {
  const client = siloDbClient();
  const { username, amount, metadata } = JSON.parse(event.body)
  const mainDescription = "Money added"
  const cashbackDesription = "Cashback"
  const addTransactionQuery = `
    INSERT INTO
    transactions (username, amount, description, metadata)
    VALUES (
      '${username}',
      ${parseInt(amount)},
      '${mainDescription}',
      '${JSON.stringify(metadata)}'::jsonb
    )
  `
  let eligibleForCashback = false
  let cashback = 0
  // if(parseInt(amount) >= 3000) {
  //   cashback = parseInt(amount) * 0.05
  //   eligibleForCashback = true
  // }
  const cashbackQuery = `
    INSERT INTO
    transactions (username, amount, description)
    VALUES (
      '${username}',
      ${parseInt(cashback)},
      '${cashbackDesription}'
    )
  `
  const totalAmount = parseInt(amount) + parseInt(cashback)
  console.log("Total amount to update - " + totalAmount + " Cashback " + cashback )
  
  const updateBalanceQuery = `
    UPDATE users
    SET balance = users.balance + ${totalAmount}
    WHERE username = '${username}'
  `
  try {
    await client.query("BEGIN")
    await client.query(addTransactionQuery)
    if(eligibleForCashback) {
      await client.query(cashbackQuery)
    }
    await client.query(updateBalanceQuery)
    await client.query("COMMIT")
    await client.end()
    return {
      statusCode: 200,
      body: "Wallet balance added successfully"
    }
  } catch(e) {
    console.error(e.message)
    await client.query("ROLLBACK")
    await client.end()
    return {
      statusCode: 400,
      body: e.message
    }
  }
}

module.exports.getTransactions = async(event) => {
  const client = dbClient()
  const { start_date, end_date } = JSON.parse(event.body)
  const query = `
    SELECT
      transactions.id,
      transactions.username,
      transactions.created_at,
      transactions.metadata,
      users.name
    FROM transactions
    INNER JOIN users ON users.username = transactions.username
    WHERE created_at >= '${start_date}'
    AND   created_at <= '${end_date}'
    AND   metadata IS NOT NULL
    ORDER BY transactions.created_at ASC;
  `
  try {
    const response = await client.query(query)
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(response.rows)
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
