const mongoose = require("mongoose");
const User = require("../models/user.model");
const Generation = require("../models/generation.model");
const Purchase = require("../models/purchase.model");
const CreditTransaction = require("../models/creditTransaction.model");
const { getAndroidPublisherClient, packageName } = require("../config/googlePlay");

// Helper mapping for product SKUs
const PRODUCT_MAP = {
  single_shoot: { credits: 1, price: 299 },
  starter_pack: { credits: 3, price: 699 },
  pro_pack: { credits: 5, price: 999 },
};

/**
 * Verifies a Google Play In-App Purchase token server-side,
 * enforces account identity matching, prevents duplicate redemptions,
 * increments user credits, and unlocks photoshoot generations.
 */
async function verifyPurchase(req, res, next) {
  try {
    const userId = req.user.id;
    const { productId, packageId, purchaseToken } = req.body;

    const sku = productId || packageId;

    if (!sku || !purchaseToken) {
      return res.status(400).json({
        error_code: "MISSING_PARAMETERS",
        message: "productId (or packageId) and purchaseToken are required",
      });
    }

    const packDetails = PRODUCT_MAP[sku];
    if (!packDetails) {
      return res.status(400).json({
        error_code: "INVALID_PRODUCT_ID",
        message: "productId must be one of: single_shoot, starter_pack, pro_pack",
      });
    }

    const { credits: creditsToAdd, price: pricePaid } = packDetails;

    // 1. Authenticate with Google Play Developer API and verify token
    let publisher;
    try {
      publisher = getAndroidPublisherClient();
    } catch (configErr) {
      console.error("[paymentController] Google Play config error:", configErr.message);
      return res.status(500).json({
        error_code: "PAYMENT_CONFIG_ERROR",
        message: "Google Play Developer API service credentials not configured on backend",
      });
    }

    console.log(`[paymentController] Verifying purchase token for user ${userId}, SKU: ${sku}...`);

    const googleRes = await publisher.purchases.products.get({
      packageName,
      productId: sku,
      token: purchaseToken,
    });

    const purchaseData = googleRes.data;
    console.log(`[paymentController] Google API validation response:`, purchaseData);

    const purchaseState = purchaseData.purchaseState; // 0 = Purchased, 1 = Canceled, 2 = Pending
    const orderId = purchaseData.orderId || `GPA_TOKEN_${purchaseToken.substring(0, 20)}`;

    if (purchaseState === 2) {
      return res.status(200).json({
        status: "pending",
        message: "Purchase is pending payment clearance",
        orderId,
      });
    }

    if (purchaseState !== 0) {
      return res.status(400).json({
        error_code: "PURCHASE_NOT_VALID",
        message: `Purchase state is invalid (state: ${purchaseState})`,
      });
    }

    // 2. Account Matching Identity Check (Anti-Replay Fraud)
    const externalAccountId = purchaseData.obfuscatedExternalAccountId;
    if (externalAccountId && externalAccountId !== userId.toString()) {
      console.warn(
        `[paymentController] Fraud Alert: Purchase token externalAccountId (${externalAccountId}) does not match logged-in user (${userId})`
      );
      return res.status(403).json({
        error_code: "TOKEN_ACCOUNT_MISMATCH",
        message: "Purchase token belongs to a different account",
      });
    }

    // 3. Duplicate Order Check (Idempotency)
    const existingPurchase = await Purchase.findOne({
      $or: [{ order_id: orderId }, { purchase_token: purchaseToken }],
    });

    if (existingPurchase && existingPurchase.payment_status === "completed") {
      console.log(`[paymentController] Order ${orderId} already processed. Returning cached success.`);
      const currentUser = await User.findById(userId);
      return res.status(200).json({
        message: "Purchase already processed",
        already_processed: true,
        user: {
          id: currentUser._id,
          name: currentUser.name,
          email: currentUser.email,
          free_generations_used: currentUser.free_generations_used,
          paid_credits: currentUser.paid_credits,
        },
        transaction: {
          order_id: existingPurchase.order_id,
          package_id: existingPurchase.package_id,
          credits_added: existingPurchase.credits_added,
        },
      });
    }

    // 4. Update user credits atomically
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $inc: { paid_credits: creditsToAdd } },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        error_code: "USER_NOT_FOUND",
        message: "User not found",
      });
    }

    // 5. Unlock ALL previously locked photoshoots for single_shoot or first purchase
    const userObjectId = new mongoose.Types.ObjectId(userId);
    let trialUnlocked = false;
    const unlockResult = await Generation.updateMany(
      { user_id: userObjectId, is_unlocked: false },
      { $set: { is_unlocked: true, payment_type: "paid" } }
    );
    if ((unlockResult.modifiedCount || 0) > 0) {
      trialUnlocked = true;
      console.log(`[paymentController] Unlocked ${unlockResult.modifiedCount} locked photoshoots for user ${userId}`);
    }

    // 6. Record transaction in Purchase collection
    const transactionId = `tx_gp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const purchaseRecord = new Purchase({
      user_id: updatedUser._id,
      email: updatedUser.email,
      package_id: sku,
      price_paid: pricePaid,
      credits_added: creditsToAdd,
      payment_status: "completed",
      transaction_id: transactionId,
      order_id: orderId,
      purchase_token: purchaseToken,
      purchase_state: purchaseState,
      consumption_state: 0,
      acknowledged: purchaseData.acknowledgementState === 1,
    });
    await purchaseRecord.save();

    // 7. Write CreditTransaction audit log
    const auditTx = new CreditTransaction({
      user_id: updatedUser._id,
      source: "purchase",
      package_id: sku,
      credits: creditsToAdd,
      order_id: orderId,
    });
    await auditTx.save();

    console.log(`[paymentController] Verified order ${orderId}. Added ${creditsToAdd} credits to user ${userId}.`);

    return res.status(200).json({
      message: "Purchase verified successfully",
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        free_generations_used: updatedUser.free_generations_used,
        paid_credits: updatedUser.paid_credits,
      },
      transaction: {
        order_id: orderId,
        package_id: sku,
        price_paid: pricePaid,
        credits_added: creditsToAdd,
        trial_unlocked: trialUnlocked,
        transaction_id: transactionId,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error("[paymentController] verifyPurchase error:", error);
    next(error);
  }
}

/**
 * Legacy mock purchase endpoint for quick unit testing if needed.
 */
async function mockPurchase(req, res, next) {
  try {
    const userId = req.user.id;
    const { packageId } = req.body;

    if (!packageId) {
      return res.status(400).json({
        error_code: "MISSING_PACKAGE_ID",
        message: "packageId is required",
      });
    }

    let creditsToAdd = 0;
    let pricePaid = 0;
    if (packageId === "single_shoot") {
      creditsToAdd = 1;
      pricePaid = 299;
    } else if (packageId === "starter_pack") {
      creditsToAdd = 3;
      pricePaid = 699;
    } else if (packageId === "pro_pack") {
      creditsToAdd = 5;
      pricePaid = 999;
    } else {
      return res.status(400).json({
        error_code: "INVALID_PACKAGE_ID",
        message: "packageId must be one of: single_shoot, starter_pack, pro_pack",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error_code: "USER_NOT_FOUND",
        message: "User not found",
      });
    }

    let trialUnlocked = false;
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const unlockResult = await Generation.updateMany(
      { user_id: userObjectId, is_unlocked: false },
      { $set: { is_unlocked: true, payment_type: "paid" } }
    );
    if ((unlockResult.modifiedCount || 0) > 0) {
      trialUnlocked = true;
    }

    const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const purchase = new Purchase({
      user_id: user._id,
      email: user.email,
      package_id: packageId,
      price_paid: pricePaid,
      credits_added: creditsToAdd,
      payment_status: "completed",
      transaction_id: transactionId,
    });
    await purchase.save();

    user.paid_credits = (user.paid_credits || 0) + creditsToAdd;
    await user.save();

    return res.status(200).json({
      message: "Simulated purchase successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        free_generations_used: user.free_generations_used,
        paid_credits: user.paid_credits,
      },
      transaction: {
        package_id: packageId,
        price_paid: pricePaid,
        credits_added: creditsToAdd,
        trial_unlocked: trialUnlocked,
        transaction_id: transactionId,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  verifyPurchase,
  mockPurchase,
};
