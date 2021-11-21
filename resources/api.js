const axios = require('axios')

module.exports.exportOrder = async (order) => {
  const headers = {
    "Authorization": "Basic cv7rDYlJs0.vitVk7W2FAawh7CN48IU",
    "Content-Type": "application/json"
  }
  const body = {
    "orderNumber": order.id,
    "customerName": order.name,
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
  await axios.post("https://api.shipday.com/orders", body, {
    headers
  })
  return order.id
}