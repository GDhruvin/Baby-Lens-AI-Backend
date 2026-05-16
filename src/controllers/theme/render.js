// src/controllers/theme/render.js

const ThemeCategory = require("../../models/ThemeCategory");

module.exports = async (req, res) => {
  try {
    const categories = await ThemeCategory.find({
      is_active: true,
    }).sort({ sort_order: 1 });

    return res.render("create-theme", {
      categories,
    });
  } catch (error) {
    return res.status(500).send(error.message);
  }
};
