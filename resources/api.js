const axios = require('axios')
const host = "https://baqg6112pd.execute-api.us-east-1.amazonaws.com/production"
// const host = "http://localhost:3000/dev"
var AWS = require('aws-sdk')

module.exports.exportOrder = async (order) => {
  const headers = {
    "Authorization": "Basic cv7rDYlJs0.vitVk7W2FAawh7CN48IU",
    "Content-Type": "application/json"
  }
  const body = {
    "orderNumber": order.id,
    "customerName": `${order.customer_id} - ${order.name}`,
    "customerAddress": order.address,
    "customerEmail": "dummy@yoyolunchbox.com",
    "customerPhoneNumber": order.phone,
    "restaurantName": "YOYO LunchBox",
    "restaurantAddress": "1st Floor, No. 17, 6th Main Rd, MGR Nagar, Venkateswara Nagar, Velachery, Chennai, Tamil Nadu 600042",
    "restaurantPhoneNumber": "9916699112",
    "pickupLatitude": "12.9798434",
    "pickupLongitude": "80.2113789",
    "deliveryLatitude": order.coordinates.latitude,
    "deliveryLongitude": order.coordinates.longitude,
    "totalOrderCost": order.cost,
    "deliveryFee": "5.0",
    "deliveryInstruction": order.remarks,
    "expectedDeliveryDate": order.date,
  }
  const result = await axios.post("https://api.shipday.com/orders", body, {
    headers
  })
  return result.data
}

module.exports.getUser = async (accessToken, username) => {
  const response = await axios.get(`${host}/internal/admin/user/${username}`, {
    headers: {
      "Authorization": accessToken
    }
  })
  return response.data
}

module.exports.updateOrder = async (accessToken, data) => {
  const response = await axios.patch(`${host}/admin/orders`, data, {
    headers: {
      "Authorization": accessToken
    }
  })
  return response.data
}

module.exports.getOrdersToExportApi = async (accessToken, data) => {
  const response = await axios.post(`${host}/admin/orders_to_export`, data, {
    headers: {
      "Authorization": accessToken
    }
  })
  return response.data
}

module.exports.getAccessToken = async () => {
  const params = {
    "grant_type": "client_credentials",
    "scope": "https://baqg6112pd.execute-api.us-east-1.amazonaws.com/all.all"
  }
  const data = Object.keys(params)
    .map((key) => `${key}=${encodeURIComponent(params[key])}`)
    .join('&')
  
  const serviceAccountCredential = await getServiceAccountCredential()
  const response = await axios.post("https://yoyolunchbox.auth.us-east-1.amazoncognito.com/oauth2/token",
    data , {
      headers: {
        "Authorization": `Basic ${serviceAccountCredential}`,
        "Content-Type": "application/x-www-form-urlencoded"
      }
    })
  return response.data.access_token
}

getServiceAccountCredential = async () => {
  const client = new AWS.SecretsManager({
    region: "us-east-1"
  });
  const secret = await client.getSecretValue({SecretId: "service_account_credential"}).promise();
  return JSON.parse(secret.SecretString).client_id_secret_base64;
}
