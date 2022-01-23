const { siloDbClient, dbClient } = require("./database-client")
const { exportOrder, updateOrder, getOrdersToExportApi, getUser, getAccessToken } = require("./api")
const axios = require('axios')

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
  const addTransactionQuery = `
    INSERT INTO
    transactions (username, amount, description)
    VALUES (
      '${username}',
      (
        SELECT menu.price * orders.quantity
        FROM orders
        INNER JOIN menu ON menu.id = orders.menu_id
        WHERE orders.id = ${order_id}
      ),
      'Refund for cancelling order ${order_id}'
    )
  `

  try {
    await client.query("BEGIN")
    await client.query(cancelOrderQuery)
    await client.query(updateBalanceQuery)
    await client.query(addTransactionQuery)
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

module.exports.updateOrder = async (event) => {
  const { id, exported, shipday_id } = JSON.parse(event.body)
  const updateOrdersQuery = `
    UPDATE orders SET
    exported = ${exported},
    shipday_id = ${parseInt(shipday_id)}
    WHERE id = ${id}
  `
  try {
    await client.query(updateOrdersQuery)
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: "Update successful"
    }
  } catch (e) {
    console.log(e)
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: "Query failed"
    }
  }
}

module.exports.getOrdersToExport = async (event) => {
  const { date, type } = JSON.parse(event.body)
  const ordersFetchQuery = `
    SELECT orders.id,
           orders.cost,
           orders.remarks,
           orders.username,
           orders.status,
           menu.date
    FROM orders
    INNER JOIN menu ON menu.id = orders.menu_id
    WHERE date = '${date}'
    AND type = '${type}'
    AND status != 'cancelled'
    AND exported = false
  `
  try {
    const result = await client.query(ordersFetchQuery)
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(result.rows)
    }
  } catch (e) {
    console.log(e)
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
  const accessToken = await getAccessToken()
  const orders = await getOrdersToExportApi(accessToken, { date, type })
  console.log(orders)
  const tasks = []
  orders.forEach(order => {
    tasks.push(exportOrderHelper(accessToken, order))
  })

  let failed = false
  const response = []
  if (tasks.length > 0) {
    await Promise.all(tasks)
      .then((result) => {
        result.forEach(res => {
          if (!res.status) {
            failed = true
          }
          response.push(res)
        })
      })
      .catch(error => {
        console.error("Error resolving promise")
        console.error(error)
        failed = true
      })
  }

  if (failed) {
    return {
      statusCode: 400,
      body: JSON.stringify(response),
    }
  }
  return {
    statusCode: 200,
    body: JSON.stringify(response)
  }
}

exportOrderHelper = async (accessToken, order) => {
  let result = {}
  let exportDetails = {}
  try {
    if (order.status != 'cancelled' && !order.exported) {
      const user = await getUser(accessToken, order.username)
      console.log("User Details")
      console.log(user)
      exportDetails = {
        id: order.id,
        name: user.name,
        address: user.address,
        phone: user.phone,
        coordinates: user.coordinates,
        cost: order.cost,
        remarks: order.remarks,
        date: order.date
      }
      console.log("Exporting")
      console.log(exportDetails)
      result = await exportOrder(exportDetails)
      if (result.orderId) {
        const updateOrderDetails = {
          exported: true,
          id: order.id,
          shipday_id: result.orderId
        }
        await updateOrder(accessToken, updateOrderDetails)
      } else {
        throw new Error("Failed to export to shipday " + JSON.stringify(result))
      }
    } else {
      console.log(`Order ${id} either cancelled or already exported`)
    }
  } catch (e) {
    console.error("Failed to export order")
    console.error(e)
    return { status: false, exportDetails, result }
  }
  return { status: true, exportDetails, result }
}
