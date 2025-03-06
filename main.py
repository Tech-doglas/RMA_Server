from flask import Flask, render_template, request, redirect, send_from_directory, url_for
import pyodbc
import os 
from werkzeug.utils import secure_filename

app = Flask(__name__)

# Connection string for SQL Server Express
conn_str = (
    "DRIVER={ODBC Driver 18 for SQL Server};"
    "SERVER=localhost\\SQLEXPRESS02;"
    "DATABASE=RMA;"
    "UID=sa;"
    "PWD=12345678;"
    "TrustServerCertificate=yes;"
)

@app.route('/', methods=['GET', 'POST'])
def show_rma_sheet():
    try:
        conn = pyodbc.connect(conn_str)
        cursor = conn.cursor()
        
        if request.method == 'POST':
            # Get search parameters from the form
            brand = request.form.get('brand', '').strip()
            model = request.form.get('model', '').strip()
            spec = request.form.get('spec', '').strip()
            serial_number = request.form.get('serial_number', '').strip()
            stock_sold = 'SOLD' if request.form.get('stock_sold') else None
            stock_null = True if request.form.get('stock_null') else None
            
            # Build the SQL query dynamically
            query = "SELECT * FROM RMA_sheet WHERE 1=1"
            params = []
            
            if brand:
                query += " AND Brand LIKE ?"
                params.append(f"%{brand}%")
            if model:
                query += " AND Model LIKE ?"
                params.append(f"%{model}%")
            if serial_number:
                query += " AND SerialNumber LIKE ?"
                params.append(f"%{serial_number}%")
            if spec:
                query += " AND Specification LIKE ?"
                params.append(f"%{spec}%")
            # Handle Stock conditions
            if stock_null and not stock_sold:
                # If only "Not Sold" is checked, show only NULL or empty Stock
                query += " AND (Stock IS NULL OR Stock = ?)"
                params.append('')  # Empty string
            elif stock_sold or stock_null:
                # If "Sold" is checked, or both, combine conditions
                stock_conditions = []
                if stock_sold:
                    stock_conditions.append("Stock = ?")
                    params.append(stock_sold)
                if stock_null:
                    stock_conditions.append("(Stock IS NULL OR Stock = ?)")
                    params.append('')  # Empty string
                if stock_conditions:
                    query += " AND (" + " OR ".join(stock_conditions) + ")"
            
            cursor.execute(query, params) if params else cursor.execute("SELECT * FROM RMA_sheet")
        else:
            # GET request: Show all data
            cursor.execute("SELECT * FROM RMA_sheet")
        
        data = cursor.fetchall()
        columns = [column[0] for column in cursor.description]
        results = [dict(zip(columns, row)) for row in data]
        
        conn.close()
        return render_template('index.html', items=results)
    except Exception as e:
        return f"Error: {str(e)}"

@app.route('/submit_item', methods=['POST'])
def submit_item():
    try:
        # Get form data
        brand = request.form.get('brand')
        model = request.form.get('model')
        ram = request.form.get('ram')
        ssd = request.form.get('ssd')
        spec = f"{ram}+{ssd}"
        serial_number = request.form.get('serial_number')
        condition = request.form.get('condition')
        sealed = True if request.form.get('sealed') else False
        odoo_record = True if request.form.get('odoorecord') else False  # New field
        stock = ""
        remark = request.form.get('textarea')

        conn = pyodbc.connect(conn_str)
        cursor = conn.cursor()
        
        # Insert the new item
        cursor.execute("""
            INSERT INTO RMA_sheet (Brand, Model, Spec, SerialNumber, Condition, Sealed, Stock, Remark, OdooRecord) 
            OUTPUT INSERTED.ID
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (brand, model, spec, serial_number, condition, sealed, stock, remark, odoo_record))
        
        primary_key = cursor.fetchone()[0]
        image_dir = os.path.join('images', str(primary_key))
        os.makedirs(image_dir, exist_ok=True)
        
        # Save images (unchanged)
        images = request.files.getlist('images')
        for i, image in enumerate(images, start=1):
            if image and image.filename:
                ext = os.path.splitext(secure_filename(image.filename))[1]
                filename = f"{i}{ext}"
                image_path = os.path.join(image_dir, filename)
                image.save(image_path)
        
        conn.commit()
        conn.close()
        return redirect('/')
    except Exception as e:
        return f"Error submitting item: {str(e)}"
    
@app.route('/images/<id>/<filename>')
def serve_image(id, filename):
    return send_from_directory('images', f"{id}/{filename}")

@app.route('/item/<serial_number>')
def item_detail(serial_number):
    try:
        conn = pyodbc.connect(conn_str)
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM RMA_sheet WHERE SerialNumber = ?", serial_number)
        data = cursor.fetchone()

        if not data:
            return "Item not found", 404

        columns = [column[0] for column in cursor.description]
        laptop = dict(zip(columns, data))

        image_dir = os.path.join('images', str(laptop['ID']))
        image_files = []
        if os.path.exists(image_dir):
            image_files = [f for f in os.listdir(image_dir) if os.path.isfile(os.path.join(image_dir, f))]
            image_files.sort()

        conn.close()
        print(image_files)
        return render_template('item_detail.html', laptop=laptop, image_files=image_files)
    except Exception as e:
        return f"Error: {str(e)}"
    
@app.route('/Sales/<serial_number>') 
def sales(serial_number):
    try:
        conn = pyodbc.connect(conn_str)
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM RMA_sheet WHERE SerialNumber = ?", serial_number)
        data = cursor.fetchone()

        if not data:
            return "Item not found", 404

        columns = [column[0] for column in cursor.description]
        laptop = dict(zip(columns, data))

        conn.close()
        return render_template('sales.html', laptop=laptop, serial_number=serial_number)
    except Exception as e:
        return f"Error: {str(e)}"
    
@app.route('/input')
def Laptop_input():
    try:
        return render_template('input.html')
    except Exception as e:
        return f"Error: {str(e)}"
    
@app.route('/Sales')
def Sales():
    try:
        return render_template('sales.html')
    except Exception as e:
        return f"Error: {str(e)}"

# In /submit_item route
@app.route('/salesOrder', methods=['POST'])
def salesOrder():
    try:
        # Get form data
        ram = request.form.get('ram')
        ssd = request.form.get('ssd')
        new_spec = f"{ram}+{ssd}"
        order_number = request.form.get('order')
        serial_number = request.form.get('serial_number')  # Add this to get the laptop being sold
        
        if not order_number:
            return "Order Number is required", 400

        conn = pyodbc.connect(conn_str)
        cursor = conn.cursor()
        
        # Fetch current Spec for comparison
        cursor.execute("SELECT Spec FROM RMA_sheet WHERE SerialNumber = ?", serial_number)
        current_spec = cursor.fetchone()[0]
        
        # Update OrderNumber and Stock, and UpDatedSpec if new_spec differs
        if new_spec != current_spec:
            cursor.execute("""
                UPDATE RMA_sheet 
                SET OrderNumber = ?, Stock = 'SOLD', UpDatedSpec = ? 
                WHERE SerialNumber = ?
            """, (order_number, new_spec, serial_number))
        else:
            cursor.execute("""
                UPDATE RMA_sheet 
                SET OrderNumber = ?, Stock = 'SOLD' 
                WHERE SerialNumber = ?
            """, (order_number, serial_number))
        
        conn.commit()
        conn.close()
        return redirect('/')
    except Exception as e:
        return f"Error submitting item: {str(e)}"
    
@app.route('/edit/<serial_number>')
def edit_item(serial_number):
    try:
        conn = pyodbc.connect(conn_str)
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM RMA_sheet WHERE SerialNumber = ?", serial_number)
        data = cursor.fetchone()

        if not data:
            return "Item not found", 404

        columns = [column[0] for column in cursor.description]
        laptop = dict(zip(columns, data))

        conn.close()
        return render_template('edit_item.html', laptop=laptop)
    except Exception as e:
        return f"Error: {str(e)}"

@app.route('/update/<serial_number>', methods=['POST'])
def update_item(serial_number):
    try:
        # Get form data
        brand = request.form.get('brand')
        model = request.form.get('model')
        spec = request.form.get('spec')
        serial_number_new = request.form.get('serial_number')
        condition = request.form.get('condition')
        sealed = True if request.form.get('sealed') else False
        stock = request.form.get('stock')
        order_number = request.form.get('order_number')
        updated_spec = request.form.get('updated_spec')
        remark = request.form.get('remark')
        odoo_record = True if request.form.get('odoorecord') else False  # New field

        conn = pyodbc.connect(conn_str)
        cursor = conn.cursor()
        
        # Update the item
        cursor.execute("""
            UPDATE RMA_sheet 
            SET Brand = ?, Model = ?, Spec = ?, SerialNumber = ?, Condition = ?, 
                Sealed = ?, Stock = ?, OrderNumber = ?, UpDatedSpec = ?, Remark = ?, OdooRecord = ?
            WHERE SerialNumber = ?
        """, (brand, model, spec, serial_number_new, condition, sealed, stock, 
              order_number, updated_spec, remark, odoo_record, serial_number))
        
        conn.commit()
        conn.close()
        return redirect(url_for('item_detail', serial_number=serial_number_new))
    except Exception as e:
        return f"Error updating item: {str(e)}"
@app.route('/delete/<serial_number>')
def delete_item(serial_number):
    try:
        conn = pyodbc.connect(conn_str)
        cursor = conn.cursor()
        
        # Delete the item
        cursor.execute("DELETE FROM RMA_sheet WHERE SerialNumber = ?", serial_number)
        
        # Optionally, delete associated images
        image_dir = os.path.join('images', str(serial_number))
        if os.path.exists(image_dir):
            import shutil
            shutil.rmtree(image_dir)
        
        conn.commit()
        conn.close()
        return redirect('/')
    except Exception as e:
        return f"Error deleting item: {str(e)}"

if __name__ == '__main__':
    app.run(debug=True)