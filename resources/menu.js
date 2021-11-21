const { dbClient } = require("./database-client")

const client = dbClient()

module.exports.getMenu = async (event) => {
  const { dates, username } = JSON.parse(event.body)

  const mealPreferenceQuery = `
    SELECT meal_preference
    FROM   users
    WHERE  username = '${username}'
  `

  try {

    let foodTypeFilter = "ANY('{veg, non-veg, egg}')";

    if(username) {
      const mealPreferenceResult = await client.query(mealPreferenceQuery)
      const mealPreference = mealPreferenceResult.rows[0].meal_preference
      
      if (mealPreference === "veg") {
        foodTypeFilter = "ANY('{veg}')";
      } else if (mealPreference === "egg") {
        foodTypeFilter = "ANY('{veg, egg}')";
      }
    }

    const query = `
      SELECT menu.id,
            menu.date,
            menu.type,
            menu.title,
            menu.description,
            menu.price,
            menu.image,
            menu.food_type
      FROM menu
      WHERE date = ANY('{${dates}}')
      AND   food_type = ${foodTypeFilter}
      ORDER BY menu.id DESC;
    `
    const menuResults = await client.query(query)
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(menuResults.rows)
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

module.exports.addMenu = async (event) => {
  const { date, title, description, image, price, type, food_type } = JSON.parse(event.body)
  const query = `
    INSERT INTO
    menu (
      date, title, description, image, price, type, food_type
    )
    VALUES (
      '${date}', '${title}', '${description}', '${image}', ${price}, '${type}', '${food_type}'
    )
  `

  try {
    const res = await client.query(query)
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: "Menu added"
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

module.exports.editMenu = async (event) => {
  const { id, title, description, image, food_type, type, date } = JSON.parse(event.body)
  const query = `
    UPDATE menu SET
    title = '${title}',
    description = '${description}',
    image = '${image}',
    food_type = '${food_type}',
    type = '${type}',
    date = '${date}'
    WHERE id = ${id}
  `

  try {
    await client.query(query)
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: "Menu updated"
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

module.exports.deleteMenu = async (event) => {
  const id = event.pathParameters.id
  const query = `
    DELETE FROM menu WHERE id = ${id}
  `

  try {
    await client.query(query)
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: "Menu deleted"
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
