const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');
const Razorpay = require('razorpay');

// Initialize Firebase Admin
admin.initializeApp();

// Razorpay credentials - Replace with your actual credentials
const RAZORPAY_KEY_ID = 'rzp_test_Rg4QEqb0YajyRz';
const RAZORPAY_KEY_SECRET = 'fhY44dhZwZOySREkZJkh8KeQ';

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET
});

/**
 * Create Razorpay Order
 * This function creates a Razorpay order for payment processing
 */
exports.createRazorpayOrder = functions.https.onCall(async (data, context) => {
  // Enable CORS for all origins
  const cors = require('cors')({origin: true});
  
  return new Promise((resolve, reject) => {
    cors(req, res, async () => {
      try {
        // Check if user is authenticated
        if (!context.auth) {
          console.error('No authentication context found');
          reject(new functions.https.HttpsError(
            'unauthenticated',
            'User must be authenticated to create order'
          ));
          return;
        }

        console.log('Authenticated user:', context.auth.uid);

        const { amount, currency, receipt, courseId } = data;

        // Validate required fields
        if (!amount || !currency) {
          reject(new functions.https.HttpsError(
            'invalid-argument',
            'Missing required order details: amount and currency are required'
          ));
          return;
        }

        console.log(`Creating order for amount: ${amount}, currency: ${currency}`);

        // Create Razorpay order
        const orderOptions = {
          amount: parseInt(amount), // Amount in paise
          currency: currency,
          receipt: receipt || `receipt_${Date.now()}_${context.auth.uid}`,
          notes: {
            studentId: context.auth.uid,
            courseId: courseId || 'unknown'
          }
        };

        const order = await razorpay.orders.create(orderOptions);

        console.log('Razorpay order created successfully:', order.id);

        // Return success response
        resolve({
          success: true,
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
          receipt: order.receipt
        });

      } catch (error) {
        console.error('Error creating Razorpay order:', error);
        
        // Handle specific Razorpay errors
        if (error.error && error.error.description) {
          reject(new functions.https.HttpsError(
            'internal',
            `Razorpay error: ${error.error.description}`
          ));
        } else {
          reject(new functions.https.HttpsError(
            'internal',
            error.message || 'Failed to create Razorpay order'
          ));
        }
      }
    });
  });
});

/**
 * Verify Razorpay Payment
 * This function verifies the payment signature and updates the payment record
 */
exports.verifyRazorpayPayment = functions.https.onCall(async (data, context) => {
  // Enable CORS
  const cors = require('cors')({origin: true});
  
  return new Promise((resolve, reject) => {
    cors(req, res, async () => {
      try {
        // Check if user is authenticated
        if (!context.auth) {
          reject(new functions.https.HttpsError(
            'unauthenticated',
            'User must be authenticated to verify payment'
          ));
          return;
        }

        const {
          razorpayPaymentId,
          razorpayOrderId,
          razorpaySignature,
          paymentRecordId,
          courseId,
          teacherId
        } = data;

        // Validate required fields
        if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
          reject(new functions.https.HttpsError(
            'invalid-argument',
            'Missing required payment verification details'
          ));
          return;
        }

        console.log(`Verifying payment: ${razorpayPaymentId} for user: ${context.auth.uid}`);

        // Generate signature to verify
        const generatedSignature = crypto
          .createHmac('sha256', RAZORPAY_KEY_SECRET)
          .update(`${razorpayOrderId}|${razorpayPaymentId}`)
          .digest('hex');

        // Verify signature
        const isValid = generatedSignature === razorpaySignature;

        if (!isValid) {
          console.error('Payment signature verification failed');
          
          // Update payment record as failed if paymentRecordId is provided
          if (paymentRecordId) {
            try {
              await admin.firestore().collection('payments').doc(paymentRecordId).update({
                status: 'failed',
                errorMessage: 'Payment signature verification failed',
                verificationAttemptedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              });
            } catch (updateError) {
              console.error('Error updating payment record:', updateError);
            }
          }

          reject(new functions.https.HttpsError(
            'failed-precondition',
            'Payment signature verification failed'
          ));
          return;
        }

        console.log('Payment signature verified successfully');

        // Update payment record if paymentRecordId is provided
        if (paymentRecordId) {
          try {
            await admin.firestore().collection('payments').doc(paymentRecordId).update({
              status: 'verified',
              verified: true,
              razorpayPaymentId: razorpayPaymentId,
              razorpayOrderId: razorpayOrderId,
              razorpaySignature: razorpaySignature,
              verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log('Payment record updated successfully');
          } catch (updateError) {
            console.error('Error updating payment record:', updateError);
          }
        }

        // Enroll student in course if courseId is provided
        let enrollmentCreated = false;
        if (courseId) {
          try {
            const userId = context.auth.uid;
            const userRef = admin.firestore().collection('users').doc(userId);
            
            // Get user data to use for enrollment
            const userDoc = await userRef.get();
            const userData = userDoc.data();
            
            // Create enrollment data
            const enrollmentData = {
              progress: 0,
              completedLessons: [],
              enrolledAt: admin.firestore.FieldValue.serverTimestamp(),
              hasPassedTest: false,
              lastAccessed: admin.firestore.FieldValue.serverTimestamp(),
              lectureProgress: 0,
              testProgress: 0,
              assignmentProgress: 0,
              paymentId: paymentRecordId || 'direct_payment',
              paymentVerified: true,
              // Add teacher if provided
              ...(teacherId && { teacherId: teacherId })
            };

            // Update user document with enrollment
            await userRef.update({
              [`enrollments.${courseId}`]: enrollmentData
            });

            enrollmentCreated = true;
            console.log(`Student enrolled successfully: ${userId} in course ${courseId}`);

            // Create notification for student
            try {
              const courseDoc = await admin.firestore().collection('courses').doc(courseId).get();
              const courseData = courseDoc.data();
              const courseName = courseData?.name || courseData?.title || 'the course';

              await admin.firestore().collection('studentNotifications').add({
                studentId: userId,
                studentName: userData?.displayName || 'Student',
                studentEmail: userData?.email || context.auth.token.email || 'unknown',
                title: "Enrollment Successful!",
                message: `You have been successfully enrolled in "${courseName}"`,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                type: "enrollment",
                courseId: courseId,
                courseName: courseName,
                read: false
              });
            } catch (notificationError) {
              console.error('Error creating notification:', notificationError);
            }

          } catch (enrollmentError) {
            console.error('Error enrolling student:', enrollmentError);
            // Don't reject the entire function if enrollment fails
          }
        }

        // Return success response
        resolve({
          success: true,
          verified: true,
          message: 'Payment verified successfully',
          enrollmentCreated: enrollmentCreated
        });

      } catch (error) {
        console.error('Error verifying payment:', error);
        reject(new functions.https.HttpsError(
          'internal',
          error.message || 'Payment verification failed'
        ));
      }
    });
  });
});

/**
 * Get Payment Status
 * Helper function to check payment status
 */
exports.getPaymentStatus = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Authentication required'
      );
    }

    const { paymentRecordId } = data;

    if (!paymentRecordId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Payment record ID is required'
      );
    }

    const paymentDoc = await admin.firestore().collection('payments').doc(paymentRecordId).get();
    
    if (!paymentDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Payment record not found'
      );
    }

    const paymentData = paymentDoc.data();

    // Check if the payment belongs to the authenticated user
    if (paymentData.studentId !== context.auth.uid) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Access denied to this payment record'
      );
    }

    return {
      success: true,
      payment: paymentData
    };

  } catch (error) {
    console.error('Error getting payment status:', error);
    throw new functions.https.HttpsError(
      'internal',
      error.message || 'Failed to get payment status'
    );
  }
});

/**
 * Simple Test Function
 * Use this to verify your functions are deployed correctly
 */
exports.testFunction = functions.https.onCall(async (data, context) => {
  return {
    success: true,
    message: 'Firebase Functions are working!',
    timestamp: new Date().toISOString(),
    userId: context.auth ? context.auth.uid : 'unauthenticated'
  };
});

// Optional: HTTP endpoint for webhooks (if needed later)
exports.razorpayWebhook = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  const cors = require('cors')({origin: true});
  
  cors(req, res, async () => {
    try {
      console.log('Webhook received:', req.body);
      
      // Verify webhook signature here if needed
      // ... webhook handling logic ...
      
      res.status(200).json({status: 'Webhook received'});
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(500).json({error: 'Webhook processing failed'});
    }
  });
});