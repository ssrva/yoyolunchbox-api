const { Client } = require('pg')
let client = null

module.exports.dbClient = () => {
  if(client == null) {
    client = new Client({
      user: 'root',
      host: 'yoyolunchbox-1.ccnjt7j5gwxy.us-east-1.rds.amazonaws.com',
      database: 'yoyolunchbox',
      password: 'getshitdone',
      port: 8000,
    })
    client.connect()
  }
  return client
}

module.exports.siloDbClient = () => {
  const siloClient = new Client({
    user: 'root',
    host: 'yoyolunchbox-1.ccnjt7j5gwxy.us-east-1.rds.amazonaws.com',
    database: 'yoyolunchbox',
    password: 'getshitdone',
    port: 8000,
  })
  siloClient.connect()
  return siloClient
}