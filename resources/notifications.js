const { Expo } = require("expo-server-sdk")
const axios = require('axios')

module.exports.sendNotifications = async (event) => {
  const { message } = JSON.parse(event.body)
  console.log(message)
  try {
    const response = await axios.post("https://exp.host/--/api/v2/push/send", message, {
      headers: {
        "Content-Type": "application/json"
      }
    })
  } catch (error) {
    console.log("Errored out")
    console.log(JSON.stringify(error.response.data))
    return {
      statusCode: 400,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: "failed"
    }
  }
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*'
    },
    body: "Done"
  }
}