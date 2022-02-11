const { dbClient } = require("./database-client")

const client = dbClient()

module.exports.get = async (event) => {
  const username = event.pathParameters.username
  const query = `
    SELECT * FROM address WHERE username = '${username}'
  `
  try {
    const result = await client.query(query)
    return {
      statusCode: 200,
      body: JSON.stringify(result.rows)
    }
  } catch(e) {
    console.error(e.message)
    return {
      statusCode: 400,
      body: e.message
    }
  }
}

module.exports.add = async (event) => {
  const { username, label, address, coordinates } = JSON.parse(event.body)
  const query = `
    INSERT INTO address
    (username, address, label, coordinates)
    VALUES ('${username}', '${address}', '${label}', '${JSON.stringify(coordinates)}');
  `
  try {
    await client.query(query)
    return {
      statusCode: 200,
      body: "Address added successfully"
    }
  } catch(e) {
    console.error(e.message)
    return {
      statusCode: 400,
      body: e.message
    }
  }
}

module.exports.update = async (event) => {
  const { id, label, address, coordinates } = JSON.parse(event.body)
  const query = `
    UPDATE address
    SET address = '${address}',
        label='${label}',
        coordinates='${JSON.stringify(coordinates)}'::jsonb
    WHERE id = '${id}'
  `
  try {
    await client.query(query)
    return {
      statusCode: 200,
      body: "Address updated successfully"
    }
  } catch(e) {
    console.error(e.message)
    return {
      statusCode: 400,
      body: e.message
    }
  }
}