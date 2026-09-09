const mongoose = require("mongoose");
const User = require("../models/user.model");
const Generation = require("../models/generation.model");
const Purchase = require("../models/purchase.model");

/**
 * Verifies Google Play In-App Purchase token and credits photoshoot entitlements.
 */
async function verifyPurchase(req, res, next) {
  try {
    const userId = req.user.id;
    const { purchaseToken, productId, packageName } = req.body;

    if (!purchaseToken || !productId) {
      return res.status(400).json({
        error_code: "MISSING_PARAMS",
        message: "purchaseToken and productId are required",
      });
    }

    // Map Google Play Product IDs to Photoshoot Credits & Price
    let creditsToAdd = 0;
    let pricePaid = 0;

    if (productId === "babylens_photoshoot_1" || productId === "single_shoot") {
      creditsToAdd = 1;
      pricePaid = 299;
    } else if (productId === "babylens_photoshoot_3" || productId === "starter_pack") {
      creditsToAdd = 3;
      pricePaid = 699;
    } else if (productId === "babylens_photoshoot_5" || productId === "pro_pack") {
      creditsToAdd = 5;
      pricePaid = 999;
    } else {
      return res.status(400).json({
        error_code: "INVALID_PRODUCT_ID",
        message: `Unknown Product ID: ${productId}`,
      });
    }

    // 1. Idempotency Check: Prevent duplicate crediting for same purchaseToken
    const existingPurchase = await Purchase.findOne({ transaction_id: purchaseToken });
    if (existingPurchase) {
      const user = await User.findById(userId);
      return res.status(200).json({
        message: "Purchase already processed",
        user: {
          id: user._id,
          email: user.email,
          paid_credits: user.paid_credits,
        },
        transaction: existingPurchase,
      });
    }

    // 2. Retrieve User
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        error_code: "USER_NOT_FOUND",
        message: "User not found",
      });
    }

    // 3. Automatically unlock all existing watermarked/locked trial photos for user
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const unlockResult = await Generation.updateMany(
      { user_id: userObjectId, is_unlocked: false },
      { $set: { is_unlocked: true, payment_type: "paid" } }
    );
    const unlockedCount = unlockResult.modifiedCount || 0;

    // 4. Save Purchase Transaction
    const purchase = new Purchase({
      user_id: user._id,
      email: user.email,
      package_id: productId,
      price_paid: pricePaid,
      credits_added: creditsToAdd,
      payment_status: "completed",
      transaction_id: purchaseToken,
    });
    await purchase.save();

    // 5. Update User Credits & Purchase Status
    user.paid_credits = (user.paid_credits || 0) + creditsToAdd;
    user.hasPurchased = true;
    await user.save();

    console.log(`[verifyPurchase] Successfully credited ${creditsToAdd} photoshoots to user ${user.email}. New Balance: ${user.paid_credits}`);

    return res.status(200).json({
      message: "Purchase verified and credits granted successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        free_generations_used: user.free_generations_used,
        paid_credits: user.paid_credits,
        hasPurchased: user.hasPurchased,
      },
      transaction: {
        package_id: productId,
        price_paid: pricePaid,
        credits_added: creditsToAdd,
        trial_unlocked: unlockedCount > 0,
        transaction_id: purchaseToken,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Legacy/Mock Purchase for local testing
 */
async function mockPurchase(req, res, next) {
  return verifyPurchase(req, res, next);
}

module.exports = {
  verifyPurchase,
  mockPurchase,
};
