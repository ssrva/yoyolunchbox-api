const { siloDbClient, dbClient } = require("./database-client")
const { exportOrder } = require("./api")

const client = dbClient()

module.exports.placeOrder = async (event) => {
  const client = siloDbClient();
  // each order is expected to have the fields
  // quantity, menu_id.
  const { username, charges, orders } = JSON.parse(event.body)

  const usernames = Array(orders.length).fill(`'${username}'`)
  const quantities = orders.map(order => order.quantity)
  const menu_ids = orders.map(order => order.menu_id)
  const order_costs = orders.map(order => order.amount)
  const remarks = orders.map(order => `'${order.remarks}'`)
  const itemTotal = orders.map(order => order.amount).reduce((acc, val) => {
    return acc + val
  }, 0)
  const otherCharges = Object.values(charges).reduce((acc, val) => {
    return acc + val
  }, 0)

  const placeOrderQuery = `
    INSERT INTO
    orders (username, quantity, menu_id, cost, remarks)
    VALUES (
      UNNEST(ARRAY[${usernames.join(",")}]),
      UNNEST(ARRAY[${quantities.join(",")}]),
      UNNEST(ARRAY[${menu_ids.join(",")}]),
      UNNEST(ARRAY[${order_costs.join(",")}]),
      UNNEST(ARRAY[${remarks.join(",")}])
    )
    RETURNING id
  `
  const updateBalanceQuery = `
    UPDATE users
    SET balance = users.balance - ${itemTotal + otherCharges}
    WHERE username = '${username}'
  `

  try {
    await client.query("BEGIN")
    const response = await client.query(placeOrderQuery)
    const addTransactionQuery = `
      INSERT INTO
      transactions (username, amount, description)
      VALUES (
        '${username}',
        -${itemTotal + otherCharges},
        'Order id #${response.rows[0].id}'
      )
    `
    await client.query(addTransactionQuery)
    await client.query(updateBalanceQuery)
    await client.query("COMMIT")
    await client.end()
    return {
      statusCode: 200,
      body: "Order placed successfully"
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

module.exports.cancelOrder = async (event) => {
  const client = siloDbClient();
  const { username, order_id } = JSON.parse(event.body)
  const cancelOrderQuery = `
    UPDATE orders
    SET status = 'cancelled'
    WHERE id = ${order_id}
  `
  const updateBalanceQuery = `
    UPDATE users
    SET balance = (
      SELECT menu.price * orders.quantity
      FROM orders
      INNER JOIN menu ON menu.id = orders.menu_id
      WHERE orders.id = ${order_id}
    ) + users.balance
    WHERE username = '${username}'
  `

  try {
    await client.query("BEGIN")
    await client.query(cancelOrderQuery)
    await client.query(updateBalanceQuery)
    await client.query("COMMIT")
    await client.end()
    return {
      statusCode: 200,
      body: "Order cancelled successfully"
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

module.exports.getOrders = async (event) => {
  const date = event.pathParameters.date
  const getOrdersQuery = `
    SELECT orders.id,  
           orders.quantity,
           orders.created_on,
           users.name,
           orders.username,
           orders.status,
           orders.exported,
           orders.remarks,
           menu.type,
           menu.title,
           menu.description
    FROM orders
    INNER JOIN menu ON orders.menu_id = menu.id
    INNER JOIN users ON orders.username = users.username
    WHERE menu.date = '${date}'
    ORDER BY orders.id;
  `

  try {
    const response = await client.query(getOrdersQuery)
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
      body: "Query failed"
    }
  }
}

module.exports.updateOrderStatus = async (event) => {
  const orderId = event.pathParameters.orderId
  const status = event.pathParameters.status
  const updateOrderQuery = `
    UPDATE orders
    SET status = '${status}'
    WHERE id = '${orderId}';
  `

  try {
    await client.query(updateOrderQuery)
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: "Updated successfully"
    }
  } catch(e) {
    console.error(e.message)
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: "Query failed"
    }
  }
}

module.exports.exportToShipDay = async (event) => {
  const { date, type } = JSON.parse(event.body)
  const getOrdersQuery = `
    SELECT orders.id,
           orders.cost,
           orders.remarks,
           users.name,
           users.phone,
           users.address,
           menu.date,
           users.coordinates
    FROM orders
    INNER JOIN menu ON menu.id = orders.menu_id
    INNER JOIN users ON users.username = orders.username
    WHERE menu.date = '${date}'
    AND menu.type='${type}'
    AND orders.exported = false;
  `
  try {
    const ordersResponse = await client.query(getOrdersQuery)
    const orders = ordersResponse.rows
    const successfulOrders = []
    const exportPromises = []
    orders.forEach(order => {
      exportPromises.push(exportOrder(order))
    })
    await Promise.all(exportPromises)
      .then((value) => {
        successfulOrders.push(value)
      })
      .catch((e) => {
        console.log(e.message)
      })
    
    const updateExportedFieldQuery = `
      UPDATE orders
      SET exported = true
      WHERE id = ANY('{${successfulOrders.join(",")}}')
    `
    await client.query(updateExportedFieldQuery)

    if(successfulOrders[0].length == orders.length) {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*'
        },
        body: "Updated successfully"
      }
    } else {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*'
        },
        body: "Failed pushing few orders, please retry."
      }
    }
  } catch(e) {
    console.error(e.message)
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: "Query failed"
    }
  }
}
