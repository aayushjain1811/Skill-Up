const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');
const Razorpay = require('razorpay');

admin.initializeApp();

// Razorpay credentials
const RAZORPAY_KEY_ID = 'rzp_test_Rg4QEqb0YajyRz';
const RAZORPAY_KEY_SECRET = 'fhY44dhZwZOySREkZJkh8KeQ';
const WEBHOOK_SECRET = 'whsec_aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890';

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET
});

/**
 * Create Razorpay Order
 */
exports.createRazorpayOrder = functions.https.onCall(async (data, context) => {
  try {
    // Check if user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to create order'
      );
    }

    const { amount, currency, receipt } = data;

    // Validate required fields
    if (!amount || !currency) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing required order details'
      );
    }

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: amount, // Amount in paise
      currency: currency,
      receipt: receipt || `receipt_${Date.now()}`,
      notes: {
        studentId: context.auth.uid
      }
    });

    console.log('Razorpay order created:', order.id);

    return {
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency
    };

  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    throw new functions.https.HttpsError(
      'internal',
      error.message || 'Failed to create order'
    );
  }
});

/**
 * Verify Razorpay payment signature
 * This function is called from the frontend after payment success
 */
exports.verifyRazorpayPayment = functions.https.onCall(async (data, context) => {
  try {
    // Check if user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to verify payment'
      );
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
    if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature || !paymentRecordId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing required payment details'
      );
    }

    // Generate signature to verify
    const generatedSignature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    // Verify signature
    const isValid = generatedSignature === razorpaySignature;

    if (!isValid) {
      // Update payment record as failed
      await admin.firestore().collection('payments').doc(paymentRecordId).update({
        status: 'failed',
        errorMessage: 'Payment signature verification failed',
        verificationAttemptedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      throw new functions.https.HttpsError(
        'failed-precondition',
        'Payment signature verification failed'
      );
    }

    // Signature is valid - Update payment record
    await admin.firestore().collection('payments').doc(paymentRecordId).update({
      status: 'verified',
      verified: true,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Get payment details
    const paymentDoc = await admin.firestore().collection('payments').doc(paymentRecordId).get();
    const paymentData = paymentDoc.data();

    // Enroll student in course (if teacherId is provided)
    if (courseId && teacherId) {
      const userId = context.auth.uid;
      const userRef = admin.firestore().collection('users').doc(userId);
      
      // Create enrollment data
      const enrollmentData = {
        progress: 0,
        completedLessons: [],
        courseName: paymentData.courseName,
        enrolledAt: admin.firestore.FieldValue.serverTimestamp(),
        hasPassedTest: false,
        lastAccessed: admin.firestore.FieldValue.serverTimestamp(),
        lectureProgress: 0,
        teacherId: teacherId,
        testProgress: 0,
        assignmentProgress: 0,
        paymentId: paymentRecordId,
        paymentVerified: true
      };

      // Update user document with enrollment
      await userRef.update({
        [`enrollments.${courseId}`]: enrollmentData
      });

      console.log(`Payment verified and student enrolled: ${userId} in course ${courseId}`);
    }

    return {
      success: true,
      verified: true,
      message: 'Payment verified successfully',
      enrollmentCreated: courseId && teacherId ? true : false
    };

  } catch (error) {
    console.error('Error verifying payment:', error);
    throw new functions.https.HttpsError(
      'internal',
      error.message || 'Payment verification failed'
    );
  }
});

/**
 * Webhook endpoint for Razorpay (optional but recommended)
 * This handles server-to-server notifications from Razorpay
 */
exports.razorpayWebhook = functions.https.onRequest(async (req, res) => {
  try {
    // Verify webhook signature
    const webhookSignature = req.headers['x-razorpay-signature'];
    
    const generatedSignature = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (webhookSignature !== generatedSignature) {
      console.error('Invalid webhook signature');
      return res.status(400).send('Invalid signature');
    }

    const event = req.body.event;
    const payload = req.body.payload;

    console.log(`Razorpay webhook received: ${event}`);

    // Handle different webhook events
    switch (event) {
      case 'payment.captured':
        await handlePaymentCaptured(payload.payment.entity);
        break;
      
      case 'payment.failed':
        await handlePaymentFailed(payload.payment.entity);
        break;
      
      case 'order.paid':
        await handleOrderPaid(payload.order.entity);
        break;
      
      default:
        console.log(`Unhandled webhook event: ${event}`);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Webhook processing failed');
  }
});

// Helper function to handle payment captured event
async function handlePaymentCaptured(payment) {
  try {
    // Find payment record by Razorpay payment ID
    const paymentsSnapshot = await admin.firestore()
      .collection('payments')
      .where('razorpayPaymentId', '==', payment.id)
      .limit(1)
      .get();

    if (!paymentsSnapshot.empty) {
      const paymentDoc = paymentsSnapshot.docs[0];
      await paymentDoc.ref.update({
        status: 'captured',
        capturedAt: admin.firestore.FieldValue.serverTimestamp(),
        webhookProcessed: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`Payment captured: ${payment.id}`);
    }
  } catch (error) {
    console.error('Error handling payment captured:', error);
  }
}

// Helper function to handle payment failed event
async function handlePaymentFailed(payment) {
  try {
    // Find payment record by Razorpay payment ID
    const paymentsSnapshot = await admin.firestore()
      .collection('payments')
      .where('razorpayPaymentId', '==', payment.id)
      .limit(1)
      .get();

    if (!paymentsSnapshot.empty) {
      const paymentDoc = paymentsSnapshot.docs[0];
      await paymentDoc.ref.update({
        status: 'failed',
        errorMessage: payment.error_description || 'Payment failed',
        webhookProcessed: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`Payment failed: ${payment.id}`);
    }
  } catch (error) {
    console.error('Error handling payment failed:', error);
  }
}

// Helper function to handle order paid event
async function handleOrderPaid(order) {
  console.log(`Order paid: ${order.id}`);
  // Additional processing if needed
}