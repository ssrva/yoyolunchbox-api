const { siloDbClient, dbClient } = require("./database-client")

const client = dbClient()

module.exports.createUser = async (event) => {
  const username = event.userName
  const userAttributes = event.request.userAttributes
  const query = `
    INSERT INTO
    users (username, name, phone)
    VALUES ('${username}', '${userAttributes.name}', ${userAttributes.phone_number})
  `
  try {
    await client.query(query)
  } catch(e) {
    console.error(e.message)
  }
  return event
}

module.exports.getUser = async (event) => {
  const username = event.pathParameters.username
  const query = `
    SELECT * FROM users WHERE username = '${username}'
  `
  try {
    const response = await client.query(query)
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(response.rows[0])
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

module.exports.addTransaction = async (event) => {
  const client = siloDbClient();
  const { username, amount, description } = JSON.parse(event.body)
  const addTransactionQuery = `
    INSERT INTO
    transactions (username, amount, description)
    VALUES (
      '${username}', ${parseInt(amount)}, '${description}'
    )
  `
  const updateBalanceQuery = `
    UPDATE users
    SET balance = users.balance + ${amount}
    WHERE username = '${username}'
  `
  try {
    await client.query("BEGIN")
    await client.query(addTransactionQuery)
    await client.query(updateBalanceQuery)
    await client.query("COMMIT")
    await client.end()
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: "Wallet balance added successfully"
    }
  } catch(e) {
    console.error(e.message)
    await client.query("ROLLBACK")
    await client.end()
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: e.message
    }
  }
}

module.exports.updateUser = async (event) => {
  const { username, address, meal_preference, coordinates } = JSON.parse(event.body)
  const query = `
    UPDATE users
    SET address = $1,
        meal_preference = $2,
        coordinates = '${JSON.stringify(coordinates)}'::jsonb
    WHERE username = '${username}'
  `
  try {
    await client.query(query, [address, meal_preference])
    return {
      statusCode: 200,
      body: "User updated successfully"
    }
  } catch(e) {
    console.error(e.message)
    return {
      statusCode: 400,
      body: e.message
    }
  }
}

module.exports.getUserOrders = async (event) => {
  const status = event.pathParameters.status
  const username = event.pathParameters.username
  const page = event.pathParameters.page
  const query = `
    SELECT orders.id,  
           orders.quantity,
           orders.created_on,
           orders.status,
           menu.date,
           menu.type,
           menu.price,
           menu.title,
           menu.image,
           menu.description
    FROM orders
    INNER JOIN menu ON orders.menu_id = menu.id
    WHERE orders.username = '${username}'
      AND orders.status = '${status}'
    ORDER BY menu.date, menu.type ASC
    LIMIT 10
    OFFSET ${page};
  `

  try {
    const res = await client.query(query)
    return {
      statusCode: 200,
      body: JSON.stringify(res.rows)
    }
  } catch(e) {
    console.error(e.message)
    return {
      statusCode: 400,
      body: e.message
    }
  }
}

module.exports.getUserWalletBalance = async (event) => {
  const username = event.pathParameters.username
  const query = `
    SELECT balance
    FROM users
    WHERE username = '${username}'
  `

  try {
    const res = await client.query(query)
    return {
      statusCode: 200,
      body: JSON.stringify(res.rows[0])
    }
  } catch(e) {
    console.error(e.message)
    return {
      statusCode: 400,
      body: e.message
    }
  }
}

module.exports.getUserTransactions = async (event) => {
  const username = event.pathParameters.username
  const query = `
    SELECT amount, description, created_at
    FROM transactions
    WHERE username = '${username}'
    ORDER BY created_at DESC
    LIMIT 20
  `

  try {
    const res = await client.query(query)
    return {
      statusCode: 200,
      body: JSON.stringify(res.rows)
    }
  } catch(e) {
    console.error(e.message)
    return {
      statusCode: 400,
      body: e.message
    }
  }
}

module.exports.getAllUsers = async (event) => {
  const query = `
    SELECT * FROM users ORDER BY id DESC
  `

  try {
    const res = await client.query(query)
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(res.rows)
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

module.exports.adminUpdateUser = async (event) => {
  const { username, address, meal_preference, coordinates } = JSON.parse(event.body)
  const query = `
    UPDATE users
    SET address = $1,
        meal_preference = $2,
        coordinates = '${JSON.stringify(coordinates)}'::jsonb
    WHERE username = '${username}'
  `
  try {
    await client.query(query, [address, meal_preference])
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: "User updated successfully"
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