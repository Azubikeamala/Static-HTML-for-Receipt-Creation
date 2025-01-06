// Main content
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');

const app = express();

// Script to setup Database connection
mongoose.connect('mongodb://localhost:27017/phonestore')
    .then(() => {
        console.log('Database connected successfully');
    })
    .catch(err => {
        console.error('Database connection error:', err);
    });

// Script to Setup Database model
const Sales = mongoose.model('sales', {
    name: String, 
    email: String,
    address: String, 
    city: String, 
    province: String, 
    phone: Number, 
    delivery: String,
    totalAmount: Number,
    salesTax: Number,
    finalAmount: Number
});

// Session middleware 
app.use(session({
    secret: 'your_secret_key', 
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } 
}));

// View engine Setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); // Setting views directory

// Script to serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public'))); // Make public folder static

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));

// Script for rendering the main products page
const products = [
    { id: "iphone13", name: "iPhone 13", price: 999.99, image: '/images/iphone13pro.jpeg' },
    { id: "iphone13Pro", name: "iPhone 13 Pro", price: 1099.99, image: '/images/iphone13pro.jpeg' },
    { id: "iphone13ProMax", name: "iPhone 13 Pro Max", price: 1199.99, image: '/images/iphone13pro.jpeg' }
];

// Script to render the main page
app.get('/', (req, res) => {
    res.render('index', { 
        products, 
        errors: [], 
        name: '', 
        email: '',
        address: '', 
        city: '', 
        province: '', 
        phone: '', 
        delivery: '' 
    });
});

// Script to Render login page
app.get('/login', (req, res) => {
    res.render('login', { error: '' });
});

// Script to Handle login
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    // Admin credentials. 
    if (username === 'admin' && password === 'password') {
        req.session.isAdmin = true; // This set user as admin
        return res.redirect('/sales'); // This redirect to sales page after login
    }

    res.render('login', { error: 'Invalid credentials' }); // This shows error on invalid login
});

// Script Route to fetch and display sales data
app.get('/sales', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(403).send('Access denied');
    }

    try {
        const allSales = await Sales.find(); // Fetch all sales records
        res.render('sales', { sales: allSales });
    } catch (err) {
        console.error('Error fetching sales data:', err);
        res.status(500).send('Internal Server Error');
    }
});

// Script To handle form submission
app.post('/purchase', async (req, res) => {
    let { name, email, address, city, province, phone, delivery, selectedProducts } = req.body;

    // Script to Convert selected Products into an array
    selectedProducts = Array.isArray(selectedProducts) ? selectedProducts : (selectedProducts ? [selectedProducts] : []);
    let errors = [];

    // Script to Validate input
    if (!name) errors.name = 'Name cannot be empty';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) 
        errors.email = 'Invalid email format (example: adi@gmail.com)';
    if (!phone || !/^\d{10}$/.test(phone)) 
        errors.phone = 'Invalid phone number format (example: 5234567890)';
    if (!address) errors.address = 'Address cannot be left empty';
    if (!city) errors.city = 'City cannot be left empty';
    if (!province) errors.province = 'Province cannot be left empty';
    if (!delivery) errors.delivery = 'Delivery time cannot be left empty';

    // Script to Check if at least one product is selected
    if (!selectedProducts.length) {
        errors.push("At least one product must be selected.");
    }

    let totalAmount = 0;

    if (selectedProducts.length > 0) {
        // Script Calculate total purchase amount with quantities
        selectedProducts.forEach(id => {
            const product = products.find(p => p.id === id);
            const quantityStr = req.body[`quantity_${id}`];
            const quantity = parseInt(quantityStr, 10);

            if (isNaN(quantity) || quantity < 1) {
                errors.push(`Quantity for ${product.name} must be a number and must be greater than or equal to 1.`);
                return; 
            }

            if (product) {
                totalAmount += product.price * quantity; 
            }
        });

        if (totalAmount < 10) {
            errors.push("The minimum purchase amount is $10.");
        }
    }

    // If there are validation errors, script to render the form with error messages
    if (errors.length > 0) {
        return res.render('index', {
            products,
            errors,
            name,
            email,
            address,
            city,
            province,
            phone,
            delivery
        });
    }

    // Script to Calculate sales tax and final amount after validation
    const salesTax = calculateTax(province, totalAmount);
    const finalAmount = totalAmount + salesTax;

    // Script to Create a new Sales instance
    var myNewSales = new Sales({
        name: name,
        email: email,
        address: address,
        city: city,
        province: province,
        phone: phone,
        delivery: delivery,
        totalAmount: totalAmount,
        salesTax: salesTax,
        finalAmount: finalAmount
    });

    // Script to Save to database and handle response properly
    try {
        await myNewSales.save();
        console.log('New Sale Saved');

        // Script to Generate receipt
        const purchasedProducts = selectedProducts.map(id => {
            const product = products.find(p => p.id === id);
            const quantity = parseInt(req.body[`quantity_${id}`]) || 0;
            return {
                name: product.name,
                price: product.price,
                quantity: quantity,
                total: product.price * quantity 
            };
        });

        // Script to Render the receipt page after saving
        res.render('receipt', {
            name,
            address,
            city,
            province,
            phone,
            email,
            delivery,
            selectedProducts: purchasedProducts,
            totalAmount,
            salesTax,
            finalAmount
        });
    } catch (err) {
        console.error('Error saving sale:', err);
        res.status(500).send('Internal Server Error');
    }
});

// Helper function to calculate tax based on province
function calculateTax(province, amount) {
    const taxRates = {
        'Ontario': 0.13,
        'Quebec': 0.14975,
        'British Columbia': 0.12,
        'Alberta': 0.05,
        'Manitoba': 0.12,
        'New Brunswick': 0.10,
        'Newfoundland and Labrador': 0.15,
        'Nova Scotia': 0.15,
        'Prince Edward Island': 0.15,
        'Saskatchewan': 0.11,
        'Northwest Territories': 0.05,
        'Yukon': 0.05,
        'Nunavut': 0.05
    };
    return (taxRates[province] || 0) * amount;
}

// Script to Handle logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login'); // Redirect to login after logout
    });
});

// Script to Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});