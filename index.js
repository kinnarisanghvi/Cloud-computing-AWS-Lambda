var AWS = require('aws-sdk');
var crypto = require('crypto');
var util = require('util');
var config = require('./config.json');
var dynamodb = new AWS.DynamoDB();
var ses = new AWS.SES();

exports.handler = function(event, context) {
	var message = event.Records[0].Sns.Message;
	var msgJson = JSON.parse(message);
	console.log("Event is " + message);
	var email = msgJson.emailID;
	storeUser(email, function(err, token) {
		if (err) {
			if (err.code == 'ConditionalCheckFailedException') {
				// userId already found
				context.succeed({
					created: false
				});
			} else {
				context.fail('Error in storeUser: ' + err);
			}
		} else {
			sendVerificationEmail(email, token, function(err, data) {
				if (err) {
					context.fail('Error in sendVerificationEmail: ' + err);
				} else {
					context.succeed({
						created: true
					});
				}
			});
		}
	});
}

function storeUser(email, fn) {
	// Bytesize
	var len = config.CRYPTO_BYTE_SIZE;
	
	crypto.randomBytes(len, function(err, token) {
		if (err) return fn(err);
		token = token.toString('hex');
		var verificationLink1 = config.VERIFICATION_PAGE + '?email=' + email + '&token=' + token;
		dynamodb.putItem({
			TableName: config.DDB_TABLE,
			Item: {
				id: {
					S: email
				},
				username: {
				        S: verificationLink1
				},
				verifyToken: {
					S: token
				},
				ttl: {
					N: (Math.floor(Date.now() / 1000) + 1200).toString()
				}
			},
			ConditionExpression: 'attribute_not_exists (id)'
		}, function(err, data) {
			if (err) return fn(err);
			else fn(null, token);
		});
	});
}

function sendVerificationEmail(email, token, fn) {
	var subject = 'Reset Link for ' + email;
	var verificationLink = config.VERIFICATION_PAGE + '?email=' + email + '&token=' + token;
	ses.sendEmail({
		Source: config.EMAIL_SOURCE,
		Destination: {
			ToAddresses: [
				email
			]
		},
		Message: {
			Subject: {
				Data: subject
			},
			Body: {
				Html: {
					Data: '<html><head>'
					+ '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />'
					+ '<title>' + subject + '</title>'
					+ '</head><body>'
					+ 'Please <a href="' + verificationLink + '">click here to reset your email address</a> or copy & paste the following link in a browser:'
					+ '<br><br>'
					+ '<a href="' + verificationLink + '">' + verificationLink + '</a>'
					+ '</body></html>'
				}
			}
		}
    }, fn);
    // dummy commit
}
