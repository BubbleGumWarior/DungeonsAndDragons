const express = require('express');
const router = express.Router();
const Skill = require('../models/Skill');

// Get all skills
router.get('/', async (req, res) => {
  try {
    const skills = await Skill.getAll();
    res.json({ skills: skills.rows });
  } catch (error) {
    console.error('Error fetching skills:', error);
    res.status(500).json({ error: 'Failed to fetch skills' });
  }
});

// Get skill by name
router.get('/name/:name', async (req, res) => {
  try {
    const skill = await Skill.getByName(req.params.name);
    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    res.json({ skill });
  } catch (error) {
    console.error('Error fetching skill:', error);
    res.status(500).json({ error: 'Failed to fetch skill' });
  }
});

module.exports = router;
