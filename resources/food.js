const AWS = require('aws-sdk')
const retry = require('async-retry')
const MemcachePlus = require('memcache-plus')
const { dbClient } = require("./database-client")

const client = dbClient()
var s3 = new AWS.S3()

const cacheTtl = 7 * 24 * 60 * 60 // 7 days in seconds

const cache = new MemcachePlus("yoyolunchbox.ngzi0b.0001.use1.cache.amazonaws.com:11211");

module.exports.testCache = async (event) => {
  const key = event.pathParameters.key
  const decodedKey = decodeURI(key)
  var params = {
    "Bucket": "yoyo-food-images",
    "Key": decodedKey
  }
  try {
    const data = await cache.get(decodedKey);
    if (data) {
      console.log("Cached data is present")
      return {
        body: data,
        statusCode: 200,
        isBase64Encoded: true,
      }
    }
    const result = await retry(
      async (bail) => {
        try {
          const res = await s3.getObject(params).promise()
          return res
        } catch (e) {
          console.log(e)
          bail(new Error('Error downloading file from S3'));
        }
      },
      {
        retries: 3,
      }
    )

    await cache.set(decodedKey, result.Body.toString('base64'), cacheTtl)
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

module.exports.getFoodImage = async (event) => {
  const key = event.pathParameters.key
  const decodedKey = decodeURI(key)
  var params = {
    "Bucket": "yoyo-food-images",
    "Key": decodedKey
  }
  console.log(params)
  try {
    const result = await retry(
      async (bail) => {
        try {
          const res = await s3.getObject(params).promise()
          return res
        } catch (e) {
          console.log(e)
          bail(new Error('Error downloading file from S3'));
        }
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
