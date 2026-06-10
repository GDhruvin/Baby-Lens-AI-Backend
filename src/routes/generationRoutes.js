const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middlewares/authMiddleware");
const create = require("../controllers/generation/create");
const list = require("../controllers/generation/list");
const myPhotos = require("../controllers/generation/myPhotos");
const deleteGeneration = require("../controllers/generation/delete");

router.post("/create", requireAuth, create);
router.get("/uploaded-images", requireAuth, list);
router.get("/my-photos", requireAuth, myPhotos);
router.delete("/:id", requireAuth, deleteGeneration);

module.exports = router;
