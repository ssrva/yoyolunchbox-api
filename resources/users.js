const { siloDbClient, dbClient } = require("./database-client")

const client = dbClient()

module.exports.createUser = async (event) => {
  const username = event.userName
  const userAttributes = event.request.userAttributes
  const query = `
    INSERT INTO
    users (username, name, phone, balance)
    VALUES ('${username}', '${userAttributes.name}', ${userAttributes.phone_number}, 50)
  `

  const addPromotionalBalance = `
    INSERT INTO
    transactions (username, amount, description)
    VALUES (
      '${username}',
      50,
      'New user promotional balance'
    )
  `
  try {
    await client.query(query)
    await client.query(addPromotionalBalance)
  } catch(e) {
    console.error(e.message)
  }
  return event
}

module.exports.getUser = async (event) => {
  const username = event.pathParameters.username
  const query = `
    SELECT users.id,
           users.username,
           users.phone,
           users.created_on,
           users.name,
           users.balance,
           users.meal_preference,
           users.expo_push_key,
           address.address,
           address.coordinates
    FROM users
    INNER JOIN address ON address.username = users.username
    WHERE users.username = '${username}'
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

module.exports.updateUserExpoPushkey = async (event) => {
  const { username, expo_push_key } = JSON.parse(event.body)
  const query = `
    UPDATE users
    SET expo_push_key = $1
    WHERE username = '${username}'
  `
  try {
    await client.query(query, [expo_push_key])
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

module.exports.updateMealPreference = async (event) => {
  const { username, meal_preference } = JSON.parse(event.body)
  const query = `
    UPDATE users
    SET meal_preference = '${meal_preference}'
    WHERE username = '${username}'
  `
  try {
    await client.query(query)
    return {
      statusCode: 200,
      body: "Updated successfully"
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
  const todayDate = new Date().toISOString().split("T")[0]
  // This is a temp hack to mark previous upcoming orders (orders before today
  // which are marked as upcoming) to delivered automatically whenever the user
  // tries to get delivered orders. This is because we don't have a system in place
  // to update the order to delivered.
  if (status == 'delivered') {
    const updateStatusQuery = `
      UPDATE orders
      SET status = 'delivered'
      WHERE id IN (
        SELECT orders.id
        FROM orders
        INNER JOIN menu on orders.menu_id = menu.id
        WHERE username = '${username}'
        AND menu.date < '${todayDate}'
        AND orders.status = 'upcoming'
      )
    `
    try {
      await client.query(updateStatusQuery)
    } catch(e) {
      console.error(e.message)
      return {
        statusCode: 400,
        body: e.message
      }
    }
  }
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
    ORDER BY menu.date DESC
    LIMIT 25
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
    if (res.rows.length == 0) {
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': '*'
        }
      }
    } else {
      return {
        statusCode: 200,
        body: JSON.stringify(res.rows[0]),
        headers: {
          'Access-Control-Allow-Origin': '*'
        }
      }
    }
  } catch(e) {
    console.error(e.message)
    return {
      statusCode: 400,
      body: e.message,
      headers: {
        'Access-Control-Allow-Origin': '*'
      }
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
    SELECT users.id,
           users.username,
           users.name,
           users.phone,
           users.meal_preference,
           users.created_on,
           users.expo_push_key,
           users.balance,
           address.id as address_id,
           address.address,
           address.coordinates
    FROM users
    LEFT JOIN address ON address.username = users.username
    ORDER BY users.id DESC
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
  const { username, meal_preference } = JSON.parse(event.body)
  const query = `
    UPDATE users
    SET meal_preference = $1
    WHERE username = '${username}'
  `
  try {
    await client.query(query, [meal_preference])
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