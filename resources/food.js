const AWS = require('aws-sdk')
const retry = require('async-retry')
const { dbClient } = require("./database-client")

const client = dbClient()
var s3 = new AWS.S3()

module.exports.getFoodImage = async (event) => {
  const key = event.pathParameters.key
  var params = {
    "Bucket": "yoyo-food-images",
    "Key": key
  }
  try {
    const result = await retry(
      async (bail) => {
        const res = await s3.getObject(params).promise()
        if (403 === res.status) {
          // don't retry upon 403
          bail(new Error('Unauthorized'));
          return;
        } else if (200 !== res.status) {
          bail(new Error('some other error'))
          console.log(res)
          return;
        }
    
        return res
      },
      {
        retries: 3,
      }
    )

    return {
      body: result.Body.toString('base64'),
      headers: {
        'Content-Length': result.ContentLength,
        'Content-Type': result.ContentType,
      },
      statusCode: 200,
      isBase64Encoded: true,
    }
  } catch(e) {
    console.log(e)
    return {
      statusCode: 400,
      body: e.message,
    }
  }
}
