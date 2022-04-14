const { Expo } = require("expo-server-sdk")
const axios = require('axios')

module.exports.sendNotifications = async (event) => {
  const { message } = JSON.parse(event.body)
  try {
    const toSend = [];
    for (var i = 0; i < message.to.length; i += 99) {
        const newMessage = Object.assign({}, message);
        newMessage.to = message.to.slice(i, i + 99);
        toSend.push(newMessage);
    }
    console.log(toSend)
    for (var i = 0; i < toSend.length; i++) {
      const response = await axios.post("https://exp.host/--/api/v2/push/send", toSend[i], {
        headers: {
          "Content-Type": "application/json"
        }
      })
      console.log("Sending " + JSON.stringify(toSend[i]))
    }
  } catch (error) {
    console.log("Errored out")
    console.error(error)
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