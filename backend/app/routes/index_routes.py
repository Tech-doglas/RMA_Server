# app/routes/main_routes.py
from flask import Blueprint, render_template

index_bp = Blueprint('index', __name__)

@index_bp.route('/')
def show_landing_page():
    return render_template('index.html')