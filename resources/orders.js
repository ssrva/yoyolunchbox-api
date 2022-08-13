const { siloDbClient, dbClient } = require("./database-client")
const { exportOrder, updateOrder, getOrdersToExportApi, getUser, getAccessToken } = require("./api")
const axios = require('axios')

const client = dbClient()

module.exports.placeOrder = async (event) => {
  const client = siloDbClient();
  // each order is expected to have the fields
  // quantity, menu_id.
  const { username, charges, orders, admin_placed, subscription_id } = JSON.parse(event.body)

  const usernames = Array(orders.length).fill(`'${username}'`)
  const adminPlacedOrder = Array(orders.length).fill(admin_placed ? admin_placed : false)
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
    orders (username, quantity, menu_id, cost, remarks, admin_placed)
    VALUES (
      UNNEST(ARRAY[${usernames.join(",")}]),
      UNNEST(ARRAY[${quantities.join(",")}]),
      UNNEST(ARRAY[${menu_ids.join(",")}]),
      UNNEST(ARRAY[${order_costs.join(",")}]),
      UNNEST(ARRAY[${remarks.join(",")}]),
      UNNEST(ARRAY[${adminPlacedOrder.join(",")}])
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
    const createLinkedOrders = `
      INSERT INTO
      linked_orders (username, orders, total_value, item_value, delivery_value, subscription_id)
      VALUES (
        '${username}',
        '{${response.rows.map(row => row.id).join(",")}}',
        ${itemTotal + otherCharges},
        ${itemTotal},
        ${otherCharges},
        ${subscription_id ? subscription_id : "NULL"}
      )
      RETURNING id
    `
    const addTransactionQuery = `
      INSERT INTO
      transactions (username, amount, description)
      VALUES (
        '${username}',
        -${itemTotal + otherCharges},
        'Order id #${response.rows[0].id}'
      )
    `
    if (subscription_id) {
      const updateSubscription = `
        UPDATE subscriptions
        SET free_deliveries_left = subscriptions.free_deliveries_left - 1
        WHERE id = ${subscription_id}
      `
      await client.query(updateSubscription)
    }
    const linkedOrder = await client.query(createLinkedOrders)
    const updateOrdersWithLinkedOrderId = `
      UPDATE orders
      SET linked_order_id = ${linkedOrder.rows[0].id}
      WHERE id in (${response.rows.map(row => row.id).join(",")})
    `
    await client.query(updateOrdersWithLinkedOrderId)
    await client.query(addTransactionQuery)
    await client.query(updateBalanceQuery)
    await client.query("COMMIT")
    await client.end()
    return {
      statusCode: 200,
      body: "Order placed successfully",
      headers: {
        'Access-Control-Allow-Origin': '*'
      }
    }
  } catch(e) {
    console.error(e.message)
    await client.query("ROLLBACK")
    await client.end()
    return {
      statusCode: 400,
      body: e.message,
      headers: {
        'Access-Control-Allow-Origin': '*'
      }
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
    await refundDeliveryCharge(client, username, order_id)
    await client.query("COMMIT")
    await client.end()
    return {
      statusCode: 200,
      body: "Order cancelled successfully",
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'DELETE'
      }
    }
  } catch(e) {
    console.error(e.message)
    await client.query("ROLLBACK")
    await client.end()
    return {
      statusCode: 400,
      body: e.message,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'DELETE'
      }
    }
  }
}

/**
 * Here is what we are doing 
 * 1. Get the linked order id
 * 2. Check if there are any other item in this order which is not cancelled.
 * 3. If there is such an order, then we should not refund the delivery.
 * 4. If there is no such order, then we should refund delivery charge.
 *    - Get the subscription id of that linked order.
 *    - Get the active subscription of the user. Increase free delivery for active subscription or
 *      subscription id from previous step.
 *    
 *    - If the order was not a subscription order, then refund delivery charge to user wallet.
 */
refundDeliveryCharge = async (client, username, order_id) => {
  const linkedOrderQuery = `SELECT linked_order_id FROM orders WHERE id = ${order_id}`
  const linkedOrderResponse = await client.query(linkedOrderQuery)
  const linkedOrderId = linkedOrderResponse.rows[0].linked_order_id
  if (linkedOrderId) {
    const nonCancelledOrdersQuery = `
      SELECT id FROM orders
      WHERE linked_order_id = ${linkedOrderId}
      AND status != 'cancelled'
      AND id != ${order_id}
    `
    const nonCancelledOrdersResponse = await client.query(nonCancelledOrdersQuery)
    if (nonCancelledOrdersResponse.rowCount == 0) {
      const subscriptionIdQuery = `SELECT subscription_id FROM linked_orders WHERE id = ${linkedOrderId}`
      const subscriptionIdResponse = await client.query(subscriptionIdQuery)
      let subscriptionId = subscriptionIdResponse.rows[0].subscription_id
      /**
       * If the order was made with a subscription, we simply increment the free delivery
       * count for the subscription.
       * - We try to get the current active subscription of the customer
       * - If there is one, we update the free delivery count for it
       * - Otherwise we update the free delivery count for the subscription using which
       *   the order was made. (This is just a best effort, the subscription could have crossed the validity date)
       */
      if (subscriptionId) {
        const todayDate = new Date().toISOString().substring(0,10);
        const activeSubscriptionQuery = `
          SELECT id
          FROM   subscriptions
          WHERE  username = '${username}'
          AND    end_date >= '${todayDate}'
          AND    free_deliveries_left > 0
        `
        const activeSubscriptionResponse = await client.query(activeSubscriptionQuery)
        if (activeSubscriptionResponse.rowCount > 0) {
          subscriptionId = activeSubscriptionResponse.rows[0].id
        }
        const updateSubscriptionFreeDeliveryQuery = `
          UPDATE subscriptions
          SET free_deliveries_left = subscriptions.free_deliveries_left + 1
          WHERE id = ${subscriptionId}
        `
        await client.query(updateSubscriptionFreeDeliveryQuery)
      } else {
        const updateBalanceQuery = `
          UPDATE users
          SET balance = 40 + users.balance
          WHERE username = '${username}'
        `
        const addTransactionQuery = `
          INSERT INTO
          transactions (username, amount, description)
          VALUES (
            '${username}',
            40,
            'Delivery charge refund for cancelling order ${order_id}'
          )
        `
        await client.query(updateBalanceQuery)
        await client.query(addTransactionQuery)
      }
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
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(response),
    }
  }
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*'
    },
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
        customer_id: user.id,
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
